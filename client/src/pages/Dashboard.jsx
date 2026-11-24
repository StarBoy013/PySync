import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import toast from "react-hot-toast";
import { api } from "../api";
import Workspace from "../components/Workspace";

export default function Dashboard() {
  const [projects, setProjects] = useState([]);
  const [projectName, setProjectName] = useState("");
  const [roomId, setRoomId] = useState("");
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();
  const { roomId: activeRoom } = useParams();

  async function loadProjects() {
    setLoading(true);
    try {
      const { data } = await api.get("/projects");
      setProjects(data);
    } catch (error) {
      toast.error(error.response?.data?.message || "Could not load projects");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { loadProjects(); }, []);

  async function createProject(event) {
    event.preventDefault();
    try {
      const { data } = await api.post("/projects", { projectName });
      toast.success("Room created");
      navigate(`/room/${data.roomId}`);
      await loadProjects();
    } catch (error) {
      toast.error(error.response?.data?.message || "Could not create room");
    }
  }

  function joinRoom(event) {
    event.preventDefault();
    if (!/^[a-zA-Z0-9_-]{6,20}$/.test(roomId.trim())) {
      toast.error("Room ID must be 6-20 letters, numbers, _ or -");
      return;
    }
    navigate(`/room/${roomId.trim()}`);
  }

  if (activeRoom) return <Workspace key={activeRoom} roomId={activeRoom} />;

  return (
    <main className="dashboard">
      <header className="topbar"><strong>PySync</strong><button onClick={() => { localStorage.clear(); location.assign("/login"); }}>Logout</button></header>
      <section className="dashboard-content">
        <h1>Projects</h1>
        <div className="room-actions">
          <form onSubmit={createProject}>
            <input placeholder="New project name" value={projectName} onChange={(e) => setProjectName(e.target.value)} required />
            <button>Create room</button>
          </form>
          <form onSubmit={joinRoom}>
            <input placeholder="Enter Room ID" value={roomId} onChange={(e) => setRoomId(e.target.value)} required />
            <button>Join room</button>
          </form>
        </div>
        {loading ? <p>Loading projects...</p> : projects.length === 0 ? <p className="empty-state">No projects yet. Create or join a room.</p> :
          <div className="project-grid">
            {projects.map((project) => (
              <button className="project-card" key={project.roomId} onClick={() => navigate(`/room/${project.roomId}`)}>
                <strong>{project.projectName}</strong><span>{project.roomId}</span>
              </button>
            ))}
          </div>}
      </section>
    </main>
  );
}
