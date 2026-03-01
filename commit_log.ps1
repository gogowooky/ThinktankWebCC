# Recursion Guard check
if ($env:SKIP_POST_COMMIT -eq '1') {
    exit 0
}

# 1. Gather Information
$Msg = git log -1 --format=%B
$Date = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
$Repo = "ThinktankWeb"
$Pc = $env:COMPUTERNAME

# 2. Format CSV Line
if ($Msg) {
    # Replace double quotes with double-double quotes, newlines with spaces
    $MsgFlat = $Msg -replace '"', '""' -replace "`n", ' ' -replace "`r", ''
}
else {
    $MsgFlat = ""
}

$CsvLine = "`"$Date`",`"$Repo`",`"$MsgFlat`",`"$Pc`""

# 3. Append to commit_log.csv
$LogFile = "commit_log.csv"
Add-Content -Path $LogFile -Value $CsvLine -Encoding UTF8

# 4. Stage and Amend
git add commit_log.csv

# Define Guard Variable for the child process
$env:SKIP_POST_COMMIT = '1'

# Amend commit
git commit --amend --no-edit --no-verify | Out-Null
