import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import Editor from "@monaco-editor/react";
import { io } from "socket.io-client";
import toast from "react-hot-toast";
import { api, SERVER_URL } from "../api";

export default function Workspace({ roomId }) {
  const navigate = useNavigate();
  const socketRef = useRef(null);
  const editorRef = useRef(null);
  const applyingRemote = useRef(false);
  const [code, setCode] = useState("");
  const [users, setUsers] = useState([]);
  const [driverSocketId, setDriverSocketId] = useState("");
  const [socketId, setSocketId] = useState("");
  const [stdin, setStdin] = useState("");
  const [output, setOutput] = useState({ stdout: "", stderr: "", timedOut: false });
  const [messages, setMessages] = useState([]);
  const [chatText, setChatText] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = localStorage.getItem("pysync_token");
    const socket = io(SERVER_URL, {
      auth: { token },
      reconnection: true,
      reconnectionAttempts: 10,
      reconnectionDelay: 500
    });
    socketRef.current = socket;

    function join() {
      setSocketId(socket.id || "");
      socket.emit("join-room", { roomId }, (reply) => {
        if (reply?.error) toast.error(reply.error);
        setLoading(false);
      });
    }

    socket.on("connect", join);
    socket.on("disconnect", () => toast("Connection lost. Reconnecting...", { icon: "⚠️" }));
    socket.on("connect_error", (error) => {
      setLoading(false);
      toast.error(error.message);
      if (error.message.toLowerCase().includes("token")) {
        localStorage.clear();
        navigate("/login");
      }
    });
    socket.on("room-state", (state) => {
      applyingRemote.current = true;
      const position = editorRef.current?.getPosition();
      setCode(state.code);
      if (editorRef.current && position) {
        editorRef.current.setValue(state.code);
        editorRef.current.setPosition(position);
      }
      setUsers(state.users);
      setDriverSocketId(state.driverSocketId);
      setSocketId(socket.id);
      setLoading(false);
      setTimeout(() => { applyingRemote.current = false; }, 0);
    });
    socket.on("code-change", (payload) => {
      if (typeof payload.code !== "string") return;
      applyingRemote.current = true;
      const position = editorRef.current?.getPosition();
      setCode(payload.code);
      if (editorRef.current && position) {
        editorRef.current.setValue(payload.code);
        editorRef.current.setPosition(position);
      }
      setTimeout(() => { applyingRemote.current = false; }, 0);
    });
    socket.on("user-joined", (user) => toast.success(`${user.username} joined`, { style: { color: user.color } }));
    socket.on("user-left", (user) => toast(`${user.username} left`, { icon: "👋", style: { color: user.color } }));
    socket.on("receive-message", (message) => setMessages((current) => [...current, message]));
    socket.on("run-output", (result) => setOutput(result));
    socket.on("driver-changed", (event) => {
      setDriverSocketId(event.driverSocketId);
      if (event.username) toast.success(`${event.username} took editing control`);
    });
    socket.on("control-request", (request) => {
      toast((t) => (
        <div className="control-toast">
          <span>{request.requesterName} wants editing control</span>
          <button onClick={() => {
            socket.emit("grant-control", { requesterSocketId: request.requesterSocketId });
            toast.dismiss(t.id);
          }}>Accept</button>
          <button onClick={() => toast.dismiss(t.id)}>Decline</button>
        </div>
      ), { duration: 10000 });
    });

    if (socket.connected) join();
    return () => socket.disconnect();
  }, [roomId, navigate]);

  function handleCodeChange(value) {
    setCode(value || "");
    if (applyingRemote.current) return;
    socketRef.current?.emit("code-change", { code: value || "" });
  }

  async function saveProject() {
    try {
      await api.put(`/projects/${roomId}`, { code });
      toast.success("Project saved");
    } catch (error) {
      toast.error(error.response?.data?.message || "Could not save project");
    }
  }

  function runCode() {
    if (stdin.length > 10 * 1024) {
      toast.error("Standard input exceeds 10KB");
      return;
    }
    setOutput({ stdout: "", stderr: "Running...", timedOut: false });
    socketRef.current?.emit("run-code", { code, stdin });
  }

  function downloadCode() {
    const blob = new Blob([code], { type: "text/x-python" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "main.py";
    link.click();
    URL.revokeObjectURL(url);
  }

  function sendMessage(event) {
    event.preventDefault();
    if (!chatText.trim()) return;
    socketRef.current?.emit("send-message", { text: chatText.trim() });
    setChatText("");
  }

  function requestControl() {
    socketRef.current?.emit("request-control");
  }

  function releaseControl() {
    socketRef.current?.emit("release-control");
  }

  const isDriver = socketId === driverSocketId;

  if (loading) return <main className="workspace-loading">Loading room...</main>;

  return (
    <main className="workspace">
      <header className="workspace-header">
        <button onClick={() => navigate("/")}>← Dashboard</button>
        <strong>Room {roomId}</strong>
        <span className={`mode-pill ${isDriver ? "driver" : ""}`}>{isDriver ? "Driver" : "Navigator"}</span>
      </header>

      <section className="workspace-grid">
        <aside className="left-panel panel">
          <h2>Online users</h2>
          <div className="user-list">
            {users.length === 0 ? <p className="empty-state">No users online</p> : users.map((user, index) => (
              <div className="user-row" key={`${user.userId}-${index}`}>
                <span className="user-dot" style={{ background: user.color }} />
                <span>{user.username}</span>
                {user.socketId === driverSocketId && <span className="driver-badge">Driver</span>}
              </div>
            ))}
          </div>
          {isDriver ? (
            <button className="panel-button" onClick={releaseControl}>Release control</button>
          ) : (
            <button className="panel-button" onClick={requestControl}>Request control</button>
          )}
        </aside>

        <section className="center-panel panel">
          <div className="editor-toolbar">
            <span>main.py</span>
            <div>
              <button onClick={runCode}>Run</button>
              <button onClick={saveProject}>Save</button>
              <button onClick={downloadCode}>Download</button>
            </div>
          </div>
          <Editor
            height="calc(100vh - 120px)"
            language="python"
            theme="vs-dark"
            value={code}
            onChange={handleCodeChange}
            onMount={(editor) => { editorRef.current = editor; }}
            options={{
              readOnly: !isDriver,
              minimap: { enabled: false },
              fontSize: 14,
              automaticLayout: true,
              scrollBeyondLastLine: false
            }}
          />
        </section>

        <aside className="right-panel panel">
          <div className="terminal-section">
            <h2>Output</h2>
            <pre className="terminal">
              {output.stdout && <span>{output.stdout}</span>}
              {output.stderr && <span className="stderr">{output.stderr}</span>}
              {output.timedOut && <span className="stderr">Timed out after 5s</span>}
            </pre>
          </div>
          <div className="input-section">
            <h2>Custom Input</h2>
            <textarea value={stdin} onChange={(e) => setStdin(e.target.value)} maxLength={10 * 1024} />
          </div>
          <div className="chat-section">
            <h2>Chat</h2>
            <div className="chat-messages">
              {messages.length === 0 ? <p className="empty-state">No messages</p> : messages.map((message, index) => (
                <div className="chat-message" key={`${message.sentAt}-${index}`}>
                  <strong style={{ color: message.color }}>{message.username}</strong>
                  <span>{message.text}</span>
                </div>
              ))}
            </div>
            <form onSubmit={sendMessage}>
              <input value={chatText} onChange={(e) => setChatText(e.target.value)} maxLength={2000} placeholder="Message..." />
              <button>Send</button>
            </form>
          </div>
        </aside>
      </section>
    </main>
  );
}
