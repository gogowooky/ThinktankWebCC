

#region === Keyword
#region A/E
Add-TTEvent     Keyword     'Control'           A               Keyword.Move.LineStart
Add-TTEvent     Keyword     'Control'           E               Keyword.Move.LineEnd
Add-TTEvent     Keyword     'Shift+Control'     A               Keyword.Select.LineStart
Add-TTEvent     Keyword     'Shift+Control'     E               Keyword.Select.LineDocEnd
#endregion
#region Return
Add-TTEvent     Keyword     'Control'           Return          [FdPanel].Current.Tool:Main
Add-TTEvent     Keyword     'Shift+Control'     Return          Keyword.Select.CurrentWord
#endregion
#region ↑/↓
Add-TTEvent     Keyword     'None'              Up              Keyword.Move.Up
Add-TTEvent     Keyword     'None'              Down            Keyword.Move.Down
#endregion
#region B/F, ←/→
Add-TTEvent     Keyword     'None'              Left            Keyword.Move.Left
Add-TTEvent     Keyword     'Control'           Left            Keyword.Move.PrevWord
Add-TTEvent     Keyword     'None'              Right           Keyword.Move.Right
Add-TTEvent     Keyword     'Control'           Right           Keyword.Move.NextWord

Add-TTEvent     Keyword     'Shift'             Left            Keyword.Select.Left
Add-TTEvent     Keyword     'Shift+Control'     Left            Keyword.Select.PrevWord
Add-TTEvent     Keyword     'Shift'             Right           Keyword.Select.Right
Add-TTEvent     Keyword     'Shift+Control'     Right           Keyword.Select.NextWord

Add-TTEvent     Keyword     'Control'           F               Keyword.Move.Right
Add-TTEvent     Keyword     'Control'           B               Keyword.Move.Left
Add-TTEvent     Keyword     'Shift+Control'     F               Keyword.Select.Right
Add-TTEvent     Keyword     'Shift+Control'     B               Keyword.Select.Left
#endregion
#region BS/Del
Add-TTEvent     Keyword     'None'              Back            Keyword.Delete.Left
Add-TTEvent     Keyword     'None'              Delete          Keyword.Delete.Right
Add-TTEvent     Keyword     'Shift'             Back            Keyword.Delete.Left
Add-TTEvent     Keyword     'Shift'             Delete          Keyword.Delete.Right
#endregion
#region C/V/X/Y/Z
Add-TTEvent     Keyword     'Control'           C               Keyword.Copy.Selection
Add-TTEvent     Keyword     'Shift+Control'     C               Keyword.Copy.Menu
Add-TTEvent     Keyword     'Control'           V               Keyword.Paste.Invoke
Add-TTEvent     Keyword     'Shift+Control'     V               Keyword.Paste.Menu
Add-TTEvent     Keyword     'Control'           X               Keyword.Cut.Selection
Add-TTEvent     Keyword     'Control'           Y               Keyword.Redo.Edit
Add-TTEvent     Keyword     'Control'           Z               Keyword.Undo.Edit
#endregion
#endregion
#region === Panel
#region (Alt) P/N Space 1..0
Add-TTEvent     Panel  'Alt'           P                           Panel.Move.PrevItem
Add-TTEvent     Panel  'Alt'           N                           Panel.Move.NextItem
Add-TTEvent     Panel  'Alt+Shift'     P                           Panel.Move.FirstItem
Add-TTEvent     Panel  'Alt+Shift'     N                           Panel.Move.LastItem
Add-TTEvent     Panel  'Alt'           Space                       Panel.Selected.Invoke
Add-TTEvent     Panel  'Alt+Shift'     Space                       Panel.Selected.Menu
Add-TTEvent     Panel  'Alt'       'd1,d2,d3,d4,d5,d6,d7,d8,d9,d0' Panel.Nth.Invoke
Add-TTEvent     Panel  'Alt+Shift' 'd1,d2,d3,d4,d5,d6,d7,d8,d9,d0' Panel.Nth.Menu
Add-TTEvent     Panel  'None'          Left2                       Panel.Selected.Invoke
Add-TTEvent     Panel  'None'          Right1                      Panel.Selected.Menu
#endregion
#endregion

#region === EditorMode
#region P/N
Add-TTEvent     EditorMode  'Control'           P               Memo.Move.Up
Add-TTEvent     EditorMode  'Control'           N               Memo.Move.Down
Add-TTEvent     EditorMode  'Shift+Control'     P               Memo.Move.PrevKeyword
Add-TTEvent     EditorMode  'Shift+Control'     N               Memo.Move.NextKeyword
Add-TTEvent     EditorMode  'Alt+Control+Shift' P               Memo.Move.FirstKeyword
Add-TTEvent     EditorMode  'Alt+Control+Shift' N               Memo.Move.LastKeyword
#endregion
#region S/G/Z
Add-TTEvent     EditorMode  'Control'           S               Memo.Edit.Save   
Add-TTEvent     EditorMode  'Control'           G               Memo.Edit.New
Add-TTEvent     EditorMode  'Alt'               Z               [Panels].Editor.Wordwrap:toggle
#endregion
#region (Alt) P/N Space 1..0
Add-TTEvent     EditorMode  'Alt'           P                           Editor.Move.PrevItem
Add-TTEvent     EditorMode  'Alt'           N                           Editor.Move.NextItem
Add-TTEvent     EditorMode  'Alt+Shift'     P                           Editor.Move.FirstItem
Add-TTEvent     EditorMode  'Alt+Shift'     N                           Editor.Move.LastItem
Add-TTEvent     EditorMode  'Alt'           Space                       Editor.Selected.Invoke
Add-TTEvent     EditorMode  'Alt+Shift'     Space                       Editor.Selected.Menu
Add-TTEvent     EditorMode  'Alt'       'd1,d2,d3,d4,d5,d6,d7,d8,d9,d0' Editor.Nth.Invoke
Add-TTEvent     EditorMode  'Alt+Shift' 'd1,d2,d3,d4,d5,d6,d7,d8,d9,d0' Editor.Nth.Menu
Add-TTEvent     EditorMode  'None'          Left2                       Editor.Selected.Invoke
Add-TTEvent     EditorMode  'None'          Right1                      Editor.Selected.Menu
#endregion
#region (Alt) ↑/↓
Add-TTEvent     EditorMode  'Alt'               Up              Memo.Move.PrevSection
Add-TTEvent     EditorMode  'Alt'               Down            Memo.Move.NextSection
Add-TTEvent     EditorMode  'Alt+Shift'         Up              Memo.Move.PrevSibSection
Add-TTEvent     EditorMode  'Alt+Shift'         Down            Memo.Move.NextSibSection
Add-TTEvent     EditorMode  'Alt+Shift+Control' Up              Memo.Move.FirstSibSection
Add-TTEvent     EditorMode  'Alt+Shift+Control' Down            Memo.Move.LastSibSection
#endregion
#region (Alt) ←/→
Add-TTEvent     EditorMode  'Alt'               Right           Memo.View.OpenSection
Add-TTEvent     EditorMode  'Alt'               Left            Memo.View.CloseSection     
Add-TTEvent     EditorMode  'Alt+Shift'         Right           Memo.View.OpenAllSections 
Add-TTEvent     EditorMode  'Alt+Shift'         Left            Memo.View.CloseAllSections 
#endregion
#endregion
#region === EditorMain
#region A/E/Home/End
Add-TTEvent     Editor          'Control'       A                   Memo.Move.LineDocStart
Add-TTEvent     Editor          'Control'       E                   Memo.Move.LineDocEnd
Add-TTEvent     Editor          'Shift+Control' A                   Memo.Select.LineStart
Add-TTEvent     Editor          'Shift+Control' E                   Memo.Select.LineEnd

Add-TTEvent     Editor          'None'          Home                Memo.Move.LineDocStart
Add-TTEvent     Editor          'None'          End                 Memo.Move.LineDocEnd
#endregion
#region Return
Add-TTEvent     Editor          'Control'           Return          [FdPanel].Current.Tool:Keyword
Add-TTEvent     Editor          'Shift+Control'     Return          Memo.Select.CurrentWord
#endregion
#region ↑/↓
Add-TTEvent     Editor          'None'          Up                  Memo.Move.Up
Add-TTEvent     Editor          'None'          Down                Memo.Move.Down
Add-TTEvent     Editor          'Shift'         Up                  Memo.Select.Up
Add-TTEvent     Editor          'Shift'         Down                Memo.Select.Down
#endregion
#region B/F, ←/→
Add-TTEvent     Editor           'None'          Left               Memo.Move.Left
Add-TTEvent     Editor           'Control'       Left               Memo.Move.PrevWord
Add-TTEvent     Editor           'None'          Right              Memo.Move.Right
Add-TTEvent     Editor           'Control'       Right              Memo.Move.NextWord

Add-TTEvent     Editor           'Shift'         Left               Memo.Select.Left
Add-TTEvent     Editor           'Shift+Control' Left               Memo.Select.PrevWord
Add-TTEvent     Editor           'Shift'         Right              Memo.Select.Right
Add-TTEvent     Editor           'Shift+Control' Right              Memo.Select.NextWord

Add-TTEvent     Editor           'Control'       F                  Memo.Move.Right
Add-TTEvent     Editor           'Control'       B                  Memo.Move.Left
Add-TTEvent     Editor           'Shift+Control' F                  Memo.Select.Right
Add-TTEvent     Editor           'Shift+Control' B                  Memo.Select.Left

#endregion
#region BS/Del
Add-TTEvent     Editor          'None'          Back                Memo.Delete.Left
Add-TTEvent     Editor          'None'          Delete              Memo.Delete.Right
Add-TTEvent     Editor          'Shift'         Back                Memo.Delete.Left
Add-TTEvent     Editor          'Shift'         Delete              Memo.Delete.Right
#endregion
#region C/V/X/Y/Z
Add-TTEvent     Editor          'Control'           C               Memo.Copy.Selection
Add-TTEvent     Editor          'Shift+Control'     C               Memo.Copy.Menu      # 250826
Add-TTEvent     Editor          'Control'           V               Memo.Paste.Clipboard
Add-TTEvent     Editor          'Shift+Control'     V               Memo.Paste.Menu     # 250826
Add-TTEvent     Editor          'Control'           X               Memo.Cut.Selection
Add-TTEvent     Editor          'Control'           Y               Memo.Redo.Edit
Add-TTEvent     Editor          'Control'           Z               Memo.Undo.Edit

write-host "250819: まずはEditorモードのkey assignのみ考える、ExModModeはそのあとで考える"
#endregion
#region I/?/;/Tab
Add-TTEvent     Editor      'Control'               I               Memo.Edit.IncSecLevel  
Add-TTEvent     Editor      'Shift+Control'         I               Memo.Edit.DecSecLevel  
Add-TTEvent     Editor      'Alt+Shift+Control'     I               Memo.Edit.InitSecLevel 

Add-TTEvent     Editor      'Control'               OemQuestion     Memo.Edit.NextBullet  
Add-TTEvent     Editor      'Shift+Control'         OemQuestion     Memo.Edit.PrevBullet
Add-TTEvent     Editor      'Alt+Shift+Control'     OemQuestion     Memo.Edit.RemoveBullet  

Add-TTEvent     Editor      'Control'               OemPlus         Memo.Edit.NextComment 
Add-TTEvent     Editor      'Shift+Control'         OemPlus         Memo.Edit.PrevComment 
Add-TTEvent     Editor      'Alt+Shift+Control'     OemPlus         Memo.Edit.RemoveComment 

Add-TTEvent     Editor      'Control'               Tab             Memo.Edit.AddTab   
Add-TTEvent     Editor      'Shift+Control'         Tab             Memo.Edit.RemoveTab   
#endregion
#endregion

#region === TableMode
#region (Alt) P/N Space 1..0
Add-TTEvent     TableMode   'Alt'           P                           Table.Move.PrevItem
Add-TTEvent     TableMode   'Alt'           N                           Table.Move.NextItem
Add-TTEvent     TableMode   'Alt+Shift'     P                           Table.Move.FirstItem
Add-TTEvent     TableMode   'Alt+Shift'     N                           Table.Move.LastItem
Add-TTEvent     TableMode   'Alt'           Space                       Table.Selected.Invoke
Add-TTEvent     TableMode   'Alt+Shift'     Space                       Table.Selected.Menu
Add-TTEvent     TableMode   'Alt'       'd1,d2,d3,d4,d5,d6,d7,d8,d9,d0' Table.Nth.Invoke
Add-TTEvent     TableMode   'Alt+Shift' 'd1,d2,d3,d4,d5,d6,d7,d8,d9,d0' Table.Nth.Menu
Add-TTEvent     TableMode   'None'          Left2                       Table.Selected.Invoke
Add-TTEvent     TableMode   'None'          Right1                      Table.Selected.Menu
#endregion
#region (Alt) ↑/↓
Add-TTEvent     TableMode  'Alt'               Up                       Table.Move.PrevItem
Add-TTEvent     TableMode  'Alt'               Down                     Table.Move.NextSection
Add-TTEvent     TableMode  'Alt+Shift'         Up                       Table.Move.FirstSection
Add-TTEvent     TableMode  'Alt+Shift'         Down                     Table.Move.LastSection
#endregion
#endregion
#region === TableMain
#region F1..F8
Add-TTEvent     TableMode   'None'  'F1,F2,F3,F4,F5,F6,F7,F8'               Table.NthColumn.Descend
Add-TTEvent     TableMode   'Shift' 'F1,F2,F3,F4,F5,F6,F7,F8'               Table.NthColumn.Ascend
#endregion
#region R/H
Add-TTEvent     TableMode       'Alt'           R       [FdPanel].RowHeader.Visible:true
Add-TTEvent     TableMode       'Alt+Shift'     R       [FdPanel].RowHeader.Visible:false
Add-TTEvent     TableMode       'Alt'           H       [FdPanel].ColumnHeader.Visible:true
Add-TTEvent     TableMode       'Alt+Shift'     H       [FdPanel].ColumnHeader.Visible:false
#endregion


#endregion

#region === WebViewMode
#region (Alt) P/N Space 1..0
Add-TTEvent     WebViewMode     'Alt'           P                           WebView.Move.PrevItem
Add-TTEvent     WebViewMode     'Alt'           N                           WebView.Move.NextItem
Add-TTEvent     WebViewMode     'Alt+Shift'     P                           WebView.Move.FirstItem
Add-TTEvent     WebViewMode     'Alt+Shift'     N                           WebView.Move.LastPrevItem
Add-TTEvent     WebViewMode     'Alt'           Space                       WebView.Selected.Invoke
Add-TTEvent     WebViewMode     'Alt+Shift'     Space                       WebView.Selected.Menu
Add-TTEvent     WebViewMode     'Alt'       'd1,d2,d3,d4,d5,d6,d7,d8,d9,d0' WebView.Nth.Invoke
Add-TTEvent     WebViewMode     'Alt+Shift' 'd1,d2,d3,d4,d5,d6,d7,d8,d9,d0' WebView.Nth.Menu
Add-TTEvent     WebViewMode     'None'          Left2                       WebView.Selected.Invoke
Add-TTEvent     WebViewMode     'None'          Right1                      WebView.Selected.Menu
#endregion
#endregion
#region === WebViewMain
#endregion
