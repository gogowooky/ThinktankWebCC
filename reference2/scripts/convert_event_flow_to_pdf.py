# -*- coding: utf-8 -*-
"""
event_flow_diagram.mdをPDFとして出力するスクリプト
Mermaid図を画像に変換してPDFに埋め込み
"""

from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import mm
from reportlab.lib.colors import HexColor
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, Image
from reportlab.lib.enums import TA_LEFT, TA_CENTER
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
import os
import re
import subprocess
import tempfile
import shutil

# 日本語フォント登録（Windows標準フォント）
try:
    pdfmetrics.registerFont(TTFont('MSGothic', 'msgothic.ttc'))
    pdfmetrics.registerFont(TTFont('MSMincho', 'msmincho.ttc'))
    FONT_NAME = 'MSGothic'
except:
    FONT_NAME = 'Helvetica'


def render_mermaid_to_png(mermaid_code, output_path):
    """Mermaidコードを画像に変換"""
    # 一時ファイルにMermaidコードを書き込み
    with tempfile.NamedTemporaryFile(mode='w', suffix='.mmd', delete=False, encoding='utf-8') as f:
        f.write(mermaid_code)
        mmd_path = f.name
    
    try:
        # mmdcコマンドで画像に変換
        result = subprocess.run(
            ['cmd', '/c', 'mmdc', '-i', mmd_path, '-o', output_path, '-b', 'white', '-s', '2'],
            capture_output=True,
            text=True,
            timeout=120
        )
        
        if result.returncode != 0:
            print(f"  Mermaid変換エラー: {result.stderr}")
            return False
        
        return os.path.exists(output_path)
    except subprocess.TimeoutExpired:
        print(f"  Mermaid変換タイムアウト")
        return False
    except Exception as e:
        print(f"  Mermaid変換例外: {e}")
        return False
    finally:
        # 一時ファイル削除
        if os.path.exists(mmd_path):
            os.remove(mmd_path)


def create_styles():
    """スタイル定義"""
    styles = getSampleStyleSheet()
    
    styles.add(ParagraphStyle(
        name='JTitle',
        fontName=FONT_NAME,
        fontSize=24,
        leading=30,
        alignment=TA_CENTER,
        spaceAfter=20,
        textColor=HexColor('#2E74B5')
    ))
    
    styles.add(ParagraphStyle(
        name='JHeading1',
        fontName=FONT_NAME,
        fontSize=18,
        leading=24,
        spaceBefore=20,
        spaceAfter=10,
        textColor=HexColor('#2E74B5')
    ))
    
    styles.add(ParagraphStyle(
        name='JHeading2',
        fontName=FONT_NAME,
        fontSize=14,
        leading=18,
        spaceBefore=15,
        spaceAfter=8,
        textColor=HexColor('#2E74B5')
    ))
    
    styles.add(ParagraphStyle(
        name='JHeading3',
        fontName=FONT_NAME,
        fontSize=12,
        leading=16,
        spaceBefore=12,
        spaceAfter=6,
        textColor=HexColor('#2E74B5')
    ))
    
    styles.add(ParagraphStyle(
        name='JBody',
        fontName=FONT_NAME,
        fontSize=10,
        leading=14,
        spaceAfter=6
    ))
    
    styles.add(ParagraphStyle(
        name='JCode',
        fontName='Courier',
        fontSize=8,
        leading=10,
        leftIndent=10,
        spaceAfter=2,
        backColor=HexColor('#F5F5F5')
    ))
    
    styles.add(ParagraphStyle(
        name='JList',
        fontName=FONT_NAME,
        fontSize=10,
        leading=14,
        leftIndent=20,
        spaceAfter=4
    ))
    
    return styles


def escape_xml(text):
    """XML特殊文字をエスケープ"""
    text = text.replace('&', '&amp;')
    text = text.replace('<', '&lt;')
    text = text.replace('>', '&gt;')
    return text


def convert_markdown_to_pdf_with_diagrams(md_path, output_path):
    """MarkdownファイルをPDFに変換（Mermaid図を画像として埋め込み）"""
    
    styles = create_styles()
    
    doc = SimpleDocTemplate(
        output_path,
        pagesize=A4,
        rightMargin=15*mm,
        leftMargin=15*mm,
        topMargin=15*mm,
        bottomMargin=15*mm
    )
    
    story = []
    
    with open(md_path, 'r', encoding='utf-8') as f:
        content = f.read()
    
    lines = content.split('\n')
    
    # 一時ディレクトリ作成
    temp_dir = tempfile.mkdtemp()
    mermaid_count = 0
    
    try:
        i = 0
        in_code_block = False
        code_block_lines = []
        code_language = ''
        in_table = False
        table_lines = []
        
        while i < len(lines):
            line = lines[i]
            
            # コードブロックの開始/終了
            if line.strip().startswith('```'):
                if not in_code_block:
                    in_code_block = True
                    code_language = line.strip()[3:]
                    code_block_lines = []
                else:
                    in_code_block = False
                    
                    if code_language == 'mermaid':
                        # Mermaid図を画像に変換
                        mermaid_code = '\n'.join(code_block_lines)
                        mermaid_count += 1
                        img_path = os.path.join(temp_dir, f'mermaid_{mermaid_count}.png')
                        
                        print(f"Mermaid図 {mermaid_count} を変換中...")
                        if render_mermaid_to_png(mermaid_code, img_path):
                            # 画像をPDFに挿入
                            try:
                                # 画像サイズを調整（ページ幅に収まるように）
                                img = Image(img_path)
                                max_width = 170 * mm  # A4幅 - マージン
                                max_height = 200 * mm
                                
                                # アスペクト比を保持してリサイズ
                                ratio = min(max_width / img.drawWidth, max_height / img.drawHeight, 1.0)
                                img.drawWidth *= ratio
                                img.drawHeight *= ratio
                                
                                story.append(img)
                                story.append(Spacer(1, 10))
                                print(f"  → 成功（{img.drawWidth/mm:.1f}mm x {img.drawHeight/mm:.1f}mm）")
                            except Exception as e:
                                print(f"  → 画像挿入エラー: {e}")
                                story.append(Paragraph(f"[図 {mermaid_count}: 挿入エラー]", styles['JCode']))
                        else:
                            # 変換失敗時はテキストで表示
                            story.append(Paragraph(f"[図 {mermaid_count}: 変換失敗]", styles['JCode']))
                            print(f"  → 失敗（テキスト表示にフォールバック）")
                    
                    elif code_language == 'typescript':
                        # TypeScriptコードブロック
                        for code_line in code_block_lines:
                            escaped = escape_xml(code_line)
                            story.append(Paragraph(escaped, styles['JCode']))
                        story.append(Spacer(1, 6))
                    else:
                        # その他のコードブロック
                        for code_line in code_block_lines:
                            escaped = escape_xml(code_line)
                            story.append(Paragraph(escaped, styles['JCode']))
                        story.append(Spacer(1, 6))
                    
                    code_block_lines = []
                    code_language = ''
                i += 1
                continue
            
            if in_code_block:
                code_block_lines.append(line)
                i += 1
                continue
            
            # テーブル行の検出
            if line.strip().startswith('|'):
                if not in_table:
                    in_table = True
                    table_lines = []
                table_lines.append(line)
                i += 1
                continue
            elif in_table:
                in_table = False
                # テーブル処理
                headers = []
                rows = []
                for j, tline in enumerate(table_lines):
                    cells = [c.strip().replace('`', '') for c in tline.split('|')[1:-1]]
                    if j == 0:
                        headers = cells
                    elif not all(c.replace('-', '').replace(':', '') == '' for c in cells):
                        rows.append(cells)
                
                if headers and rows:
                    data = [headers] + rows
                    t = Table(data)
                    t.setStyle(TableStyle([
                        ('BACKGROUND', (0, 0), (-1, 0), HexColor('#2E74B5')),
                        ('TEXTCOLOR', (0, 0), (-1, 0), HexColor('#FFFFFF')),
                        ('FONTNAME', (0, 0), (-1, -1), FONT_NAME),
                        ('FONTSIZE', (0, 0), (-1, -1), 8),
                        ('ALIGN', (0, 0), (-1, -1), 'CENTER'),
                        ('GRID', (0, 0), (-1, -1), 0.5, HexColor('#CCCCCC')),
                        ('BOTTOMPADDING', (0, 0), (-1, -1), 4),
                        ('TOPPADDING', (0, 0), (-1, -1), 4),
                    ]))
                    story.append(t)
                    story.append(Spacer(1, 10))
                table_lines = []
            
            # 見出し
            if line.startswith('# '):
                text = escape_xml(line[2:].strip())
                story.append(Paragraph(text, styles['JTitle']))
            elif line.startswith('## '):
                text = escape_xml(line[3:].strip())
                story.append(Paragraph(text, styles['JHeading1']))
            elif line.startswith('### '):
                text = escape_xml(line[4:].strip())
                story.append(Paragraph(text, styles['JHeading2']))
            elif line.startswith('#### '):
                text = escape_xml(line[5:].strip())
                story.append(Paragraph(text, styles['JHeading3']))
            # 水平線
            elif line.strip() == '---':
                story.append(Spacer(1, 10))
                story.append(Paragraph('─' * 80, styles['JBody']))
                story.append(Spacer(1, 10))
            # 空行
            elif line.strip() == '':
                story.append(Spacer(1, 4))
            # 番号付きリスト
            elif re.match(r'^\d+\.', line.strip()):
                text = escape_xml(line.strip())
                text = re.sub(r'\*\*(.+?)\*\*', r'<b>\1</b>', text)
                text = text.replace('`', '')
                story.append(Paragraph(text, styles['JList']))
            # 通常の段落
            else:
                text = line.strip()
                if text:
                    text = escape_xml(text)
                    text = re.sub(r'\*\*(.+?)\*\*', r'<b>\1</b>', text)
                    text = text.replace('`', '')
                    story.append(Paragraph(text, styles['JBody']))
            
            i += 1
        
        # 残っているテーブルを処理
        if in_table and table_lines:
            headers = []
            rows = []
            for j, tline in enumerate(table_lines):
                cells = [c.strip().replace('`', '') for c in tline.split('|')[1:-1]]
                if j == 0:
                    headers = cells
                elif not all(c.replace('-', '').replace(':', '') == '' for c in cells):
                    rows.append(cells)
            
            if headers and rows:
                data = [headers] + rows
                t = Table(data)
                t.setStyle(TableStyle([
                    ('BACKGROUND', (0, 0), (-1, 0), HexColor('#2E74B5')),
                    ('TEXTCOLOR', (0, 0), (-1, 0), HexColor('#FFFFFF')),
                    ('FONTNAME', (0, 0), (-1, -1), FONT_NAME),
                    ('FONTSIZE', (0, 0), (-1, -1), 8),
                    ('ALIGN', (0, 0), (-1, -1), 'CENTER'),
                    ('GRID', (0, 0), (-1, -1), 0.5, HexColor('#CCCCCC')),
                ]))
                story.append(t)
        
        # PDF生成
        os.makedirs(os.path.dirname(output_path), exist_ok=True)
        doc.build(story)
        print(f"\nPDFファイルを保存しました: {output_path}")
        print(f"埋め込んだMermaid図の数: {mermaid_count}")
        
    finally:
        # 一時ディレクトリ削除
        shutil.rmtree(temp_dir, ignore_errors=True)


def main():
    md_path = r"C:\Users\gogow\.gemini\antigravity\brain\51279474-dce0-4e6d-aa66-ba743d491986\event_flow_diagram.md"
    output_path = r"C:\Users\gogow\Documents\ThinktankWeb\docs\event_flow_diagram.pdf"
    convert_markdown_to_pdf_with_diagrams(md_path, output_path)


if __name__ == "__main__":
    main()
