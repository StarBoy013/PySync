# PySync Manual Test Checklist

## Phase 1 - Foundation
- [ ] MongoDB is running and the server starts on port 5000.
- [ ] Register creates a user and redirects to the dashboard.
- [ ] Login with the same credentials succeeds.
- [ ] A project can be created and appears in the project list.
- [ ] Entering a valid room ID opens the workspace route.
- [ ] Invalid Room IDs show a clear validation message.
- [ ] Protected routes redirect unauthenticated users to login.

## Phase 2 - IDE Workspace and Execution
- [ ] The workspace shows users, Monaco editor, output, stdin, and chat panels.
- [ ] Running `print("hello")` shows `hello` in white terminal text.
- [ ] Running `raise Exception("boom")` shows red stderr text.
- [ ] `input()` reads a value typed in Custom Input.
- [ ] `while True: pass` stops after approximately 5 seconds and shows a timeout message.
- [ ] Download creates a `.py` file named `main.py`.

## Phase 3 - Real-time
- [ ] Two browsers join and each sees the other in the users list.
- [ ] Driver keystrokes appear in Navigator Monaco immediately.
- [ ] A Navigator's forged `code-change` event does not alter room code.
- [ ] A late joiner receives the latest in-memory code.
- [ ] Chat messages appear in every browser with the sender color.
- [ ] Run output broadcasts to all room members.
- [ ] Keystrokes do not create MongoDB writes.

## Phase 4 - Driver-Navigator Lock
- [ ] Only the Driver's Monaco is editable.
- [ ] A Navigator can request control and the Driver gets Accept/Decline.
- [ ] Granting control makes the Navigator the Driver.
- [ ] The former Driver becomes a Navigator.
- [ ] Refreshing as Driver within 4 seconds restores the same role.
- [ ] Closing a tab hands control to the next user after the grace period.
- [ ] Saving and run debounced writes persist code.
- [ ] The room empties and saves/deletes after the final user disconnect.
