using System;
using System.Text.RegularExpressions;
using System.Collections.Generic;
using System.ComponentModel;
using ICSharpCode.AvalonEdit.Document;
using ICSharpCode.AvalonEdit.Folding;

namespace Thinktank
{
    public class ThinktankDocument : INotifyPropertyChanged
    {
        private ICSharpCode.AvalonEdit.Document.TextDocument _Document = null;

        public ICSharpCode.AvalonEdit.Document.TextDocument Document
        {
            get { return _Document; }
            set { _Document = value; OnPropertyChanged("Document"); }
        }

        public event PropertyChangedEventHandler PropertyChanged;

        private void OnPropertyChanged(string name)
        {
            if (null == this.PropertyChanged) return;
            this.PropertyChanged(this, new PropertyChangedEventArgs(name));
        }
    }

    public class ThinktankFoldingStrategy
    {
        public void UpdateFoldings(FoldingManager manager, TextDocument document)
        {
            int firstErrorOffset;
            IEnumerable<NewFolding> newFoldings = CreateNewFoldings(document, out firstErrorOffset);
            manager.UpdateFoldings(newFoldings, firstErrorOffset);
        }

        public IEnumerable<NewFolding> CreateNewFoldings(TextDocument document, out int firstErrorOffset)
        {
            firstErrorOffset = -1;
            return CreateNewFoldings(document);
        }

        public IEnumerable<NewFolding> CreateNewFoldings(TextDocument document)
        {
            var newFoldings = new List<NewFolding>();
            if (document == null || document.TextLength == 0)
            {
                return newFoldings;
            }

            // スタックには、各レベルの見出しの開始行番号を保持します。
            var startLinesStack = new Stack<int>();
            // Markdownの見出し (#, ##, etc.) を検出する正規表現
            var headerRegex = new Regex(@"^(#+)\s", RegexOptions.Compiled);

            int lastLineNumber = document.LineCount;

            for (int i = 1; i <= lastLineNumber; i++)
            {
                var line = document.GetLineByNumber(i);
                string text = document.GetText(line);
                var match = headerRegex.Match(text);

                if (match.Success)
                {
                    int currentLevel = match.Groups[1].Value.Length;

                    // 現在のレベルより深いレベルの見出しがスタックにあれば、それらを閉じる
                    while (startLinesStack.Count > 0 && currentLevel <= GetLevelFromLine(document, startLinesStack.Peek(), headerRegex))
                    {
                        int startLineNumber = startLinesStack.Pop();
                        var startLine = document.GetLineByNumber(startLineNumber);
                        // 折りたたみの終了は、現在の見出し行の直前
                        var endLine = document.GetLineByNumber(i - 1);
                        newFoldings.Add(new NewFolding(startLine.EndOffset, endLine.EndOffset));
                    }
                    startLinesStack.Push(i);
                }
            }

            // ファイルの末尾まで開いているセクションをすべて閉じる
            while (startLinesStack.Count > 0)
            {
                int startLineNumber = startLinesStack.Pop();
                var startLine = document.GetLineByNumber(startLineNumber);
                var endLine = document.GetLineByNumber(lastLineNumber);
                newFoldings.Add(new NewFolding(startLine.EndOffset, endLine.EndOffset));
            }

            // FoldingManagerはリストがStartOffsetでソートされていることを要求するため、ソートを行う
            newFoldings.Sort((a, b) => a.StartOffset.CompareTo(b.StartOffset));

            return newFoldings;
        }

        private int GetLevelFromLine(TextDocument document, int lineNumber, Regex headerRegex)
        {
            var line = document.GetLineByNumber(lineNumber);
            string text = document.GetText(line);
            var match = headerRegex.Match(text);
            return match.Success ? match.Groups[1].Value.Length : 0;
        }
    }

}
