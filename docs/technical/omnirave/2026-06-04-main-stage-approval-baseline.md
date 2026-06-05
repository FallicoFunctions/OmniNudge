# Main Stage Approval Baseline

- Chrome version: capture with `/Applications/Google Chrome.app/Contents/MacOS/Google Chrome --version`
- Edge version: capture with `/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge --version` or mark `available: false`
- macOS version: capture with `sw_vers -productVersion`
- Review machine model: capture with `system_profiler SPHardwareDataType`
- GPU model: capture with `system_profiler SPDisplaysDataType`
- Review resolution: capture from System Settings > Displays and record exact pixel dimensions
- Windows verification machine: set `available: false` if not present at kickoff
