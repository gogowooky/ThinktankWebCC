
#region === App/Panel
#region A
Add-TTEvent     App             'Alt'           A                   Application.Current.ExMode:ExApp
#endregion
#region L/S/I/D/@
Add-TTEvent     App             'Alt'           L                   Application.Current.ExMode:ExLibrary
Add-TTEvent     App             'Alt'           I                   Application.Current.ExMode:ExIndex
Add-TTEvent     App             'Alt'           S                   Application.Current.ExMode:ExShelf
Add-TTEvent     App             'Alt'           D                   Application.Current.ExMode:ExDesk
Add-TTEvent     App             'Alt'           ImeProcessed        Application.Current.ExMode:ExSystem          #   @ / `

Add-TTEvent     App             'Alt+Shift'     L                   Application.Focus.Panel:Library
Add-TTEvent     App             'Alt+Shift'     I                   Application.Focus.Panel:Index
Add-TTEvent     App             'Alt+Shift'     S                   Application.Focus.Panel:Shelf
Add-TTEvent     App             'Alt+Shift'     D                   Application.Focus.Panel:Desk
Add-TTEvent     App             'Alt+Shift'     ImeProcessed        Application.Focus.Panel:System              #  @ / `

Add-TTEvent     App         'Alt+Shift+Control' L                   Application.Border.Style:zenLibrary
Add-TTEvent     App         'Alt+Shift+Control' I                   Application.Border.Style:zenIndex
Add-TTEvent     App         'Alt+Shift+Control' S                   Application.Border.Style:zenShelf
Add-TTEvent     App         'Alt+Shift+Control' D                   Application.Border.Style:zenDesk
Add-TTEvent     App         'Alt+Shift+Control' ImeProcessed        Application.Border.Style:zenSystem              #  @ / `
#endregion
#region Q/E/W
Add-TTEvent     Panel           'Alt'           Q                   [FdPanel].Current.Mode:Table
Add-TTEvent     Panel           'Alt'           E                   [FdPanel].Current.Mode:Editor
Add-TTEvent     Panel           'Alt'           W                   [FdPanel].Current.Mode:WebView
#endregion
#region M/C
Add-TTEvent     Panel           'Alt'           M                           Panel.Open.ContextMenu
Add-TTEvent     Panel           'Alt'           C                           Panel.Keyword.Clear
#endregion
#endregion

#region === ExModMode ExApp
#region A
Add-TTEvent     ExApp           'None'          A                   Application.Menu.Visible:toggle
#endregion
#region ←/→
Add-TTEvent     ExApp           'None'          Right               Application.Window.Screen:prev
Add-TTEvent     ExApp           'None'          Left                Application.Window.Screen:next
Add-TTEvent     ExApp           'Control'       Right               Application.Window.Width:inc
Add-TTEvent     ExApp           'Control'       Left                Application.Window.Width:dec
Add-TTEvent     ExApp           'Shift'         Right               Application.Window.XPos:right
Add-TTEvent     ExApp           'Shift'         Left                Application.Window.XPos:left
#endregion
#region ↑/↓
Add-TTEvent     ExApp           'None'          Down                Application.Window.State:normal
Add-TTEvent     ExApp           'None'          Up                  Application.Window.State:maximized
Add-TTEvent     ExApp           'Control'       Down                Application.Window.Height:inc
Add-TTEvent     ExApp           'Control'       Up                  Application.Window.Height:dec
Add-TTEvent     ExApp           'Shift'         Down                Application.Window.YPos:down
Add-TTEvent     ExApp           'Shift'         Up                  Application.Window.YPos:up
#endregion
#region </>
Add-TTEvent     ExApp           'None'          OemPeriod           Application.Window.FontSize:up
Add-TTEvent     ExApp           'None'          OemComma            Application.Window.FontSize:down
#endregion
#region F/S/D/Z
Add-TTEvent     ExApp           'None'          F                   Application.Border.Style:all
Add-TTEvent     ExApp           'None'          S                   Application.Border.Style:standard
Add-TTEvent     ExApp           'None'          D                   Application.Border.Style:debug
Add-TTEvent     ExApp           'None'          Z                   Application.Border.Style:zen
#endregion
#region B/Q
Add-TTEvent     ExApp           'None'          B                   Application.Run.Break
Add-TTEvent     ExApp           'None'          Q                   Application.Operation.Quit
#endregion
#endregion
#region === ExModMode ExPanel
#region Q/E/W
Add-TTEvent     ExPanel         'None'          Q                   [ExPanel].Current.Mode:Table
Add-TTEvent     ExPanel         'None'          E                   [ExPanel].Current.Mode:Editor
Add-TTEvent     ExPanel         'None'          W                   [ExPanel].Current.Mode:WebView
#endregion
#region P/N Space 1..0
Add-TTEvent     ExPanel         'None'          P                           Panel.Move.PrevItem
Add-TTEvent     ExPanel         'None'          N                           Panel.Move.NextItem
Add-TTEvent     ExPanel         'Shift'         P                           Panel.Move.FirstItem
Add-TTEvent     ExPanel         'Shift'         N                           Panel.Move.LastItem
Add-TTEvent     ExPanel         'None'          Space                       Panel.Selected.Invoke
Add-TTEvent     ExPanel         'Shift'         Space                       Panel.Selected.Menu
Add-TTEvent     ExPanel         'None'      'd1,d2,d3,d4,d5,d6,d7,d8,d9,d0' Panel.Nth.Invoke
Add-TTEvent     ExPanel         'Shift'     'd1,d2,d3,d4,d5,d6,d7,d8,d9,d0' Panel.Nth.Menu
write-host "250613: d1..d0はFdPanel/ExPanelの違いで挙動がややおかしい"
#endregion
#region </>
Add-TTEvent     ExPanel         'None'          OemPeriod                   Panel.FontSize.Up
Add-TTEvent     ExPanel         'None'          OemComma                    Panel.FontSize.Down
Add-TTEvent     ExPanel         'None'          WheelPlus           [ExPanel].Panel.FontSize:up
Add-TTEvent     ExPanel         'None'          WheelMinus          [ExPanel].Panel.FontSize:down
#endregion
#region ↑/↓/←/→
Add-TTEvent     ExPanel         'Alt'           Up                  Panel.Border.Up
Add-TTEvent     ExPanel         'Alt'           Down                Panel.Border.Down
Add-TTEvent     ExPanel         'Alt'           Left                Panel.Border.Left
Add-TTEvent     ExPanel         'Alt'           Right               Panel.Border.Right
write-host "250613: BorderはPanel毎ではなく、Border毎で操作したい"
#endregion
#region F1..F8
Add-TTEvent     ExPanel         'None'       'F1,F2,F3,F4,F5,F6,F7,F8'      Table.NthColumn.Descend
Add-TTEvent     ExPanel         'Shift'      'F1,F2,F3,F4,F5,F6,F7,F8'      Table.NthColumn.Ascend
#endregion
#region C
Add-TTEvent     ExPanel         'None'          C                           Panel.Keyword.Clear         # ここ Status形式になる？
#endregion
#endregion

#region === 日付入力
Add-TTEvent  Editor           'Alt'               T               Date.Insert.Date
Add-TTEvent  ExDate           'None'              Y               ExDate.Advance.Year
Add-TTEvent  ExDate           'Shift'             Y               ExDate.Rewind.Year
Add-TTEvent  ExDate           'None'              M               ExDate.Advance.Month
Add-TTEvent  ExDate           'Shift'             M               ExDate.Rewind.Month
Add-TTEvent  ExDate           'None'              D               ExDate.Advance.Day
Add-TTEvent  ExDate           'Shift'             D               ExDate.Rewind.Day
Add-TTEvent  ExDate           'None'              W               ExDate.Advance.Week
Add-TTEvent  ExDate           'Shift'             W               ExDate.Rewind.Week
Add-TTEvent  ExDate           'None'              F               ExDate.Format.Next
Add-TTEvent  ExDate           'Shift'             F               ExDate.Format.Prev
Add-TTEvent  ExDate           'None'              G               ExDate.Format.Gengo
Add-TTEvent  ExDate           'None'              J               ExDate.Format.Japan
Add-TTEvent  ExDate           'None'              U               ExDate.Format.US
Add-TTEvent  ExDate           'None'              OemOpenBrackets ExDate.Format.Tag   #   [
Add-TTEvent  ExDate           'Shift'             T               ExDate.Week.Toggle
Add-TTEvent  ExDate           'None'              T               ExDate.Time.Toggle
Add-TTEvent  ExDate           'None'              N               ExDate.Set.Now
Add-TTEvent  ExDate   'None'  'd1,d2,d3,d4,d5,d6,d7,d8,d9,d0'     ExDate.Time.Input

# Add-TTEvent  ExDate           'None'              Up              Memo.Move.PrevDate
# Add-TTEvent  ExDate           'None'              Down            Memo.Move.NextDate
# Add-TTEvent  ExDate           'None'              Return          Memo.Select.CurrentKeyword

#endregion

#region === アクター
Add-TTEvent  Keyword           'Alt'               Space            Keyword.Action.Invoke
Add-TTEvent  Keyword           'Alt+Shift'         Space            Keyword.Action.Menu
# Add-TTEvent  Keyword           'None'              Left2          Keyword.Action.Invoke
# Add-TTEvent  Keyword           'None'              Right1         Keyword.Action.Menu
#endregion

#region === メニュー
Add-TTEvent     ExMenu          'Alt'           P                   ExMenu.Key.Up
Add-TTEvent     ExMenu          'Alt'           N                   ExMenu.Key.Down
Add-TTEvent     ExMenu          'Alt'           F                   ExMenu.Key.Right
Add-TTEvent     ExMenu          'Alt'           B                   ExMenu.Key.Left
Add-TTEvent     ExMenu          'Alt'           Space               ExMenu.Key.Select
Add-TTEvent     ExMenu          'Alt'           Q                   ExMenu.Key.Cancel
#endregion

write-host "ExActorをつくればよいのでは？"