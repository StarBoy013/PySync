import express from "express";
import crypto from "crypto";
import Project from "../models/Project.js";
import { authRequired } from "../middleware/auth.js";

const router = express.Router();
router.use(authRequired);

function isRoomId(value) {
  return /^[a-zA-Z0-9_-]{6,20}$/.test(value);
}

router.post("/", async (req, res) => {
  try {
    const projectName = String(req.body.projectName || "").trim();
    if (!projectName || projectName.length > 80) return res.status(400).json({ message: "Project name must be 1-80 characters" });

    const roomId = crypto.randomBytes(5).toString("base64url").slice(0, 8);
    const project = await Project.create({ roomId, projectName, ownerId: req.user.userId, code: "", language: "python" });
    res.status(201).json(project);
  } catch (error) {
    console.error("Create project failed:", error);
    res.status(500).json({ message: "Could not create project" });
  }
});

router.get("/", async (req, res) => {
  try {
    const projects = await Project.find({ ownerId: req.user.userId }).sort({ updatedAt: -1 });
    res.json(projects);
  } catch (error) {
    console.error("List projects failed:", error);
    res.status(500).json({ message: "Could not load projects" });
  }
});

router.get("/:roomId", async (req, res) => {
  try {
    if (!isRoomId(req.params.roomId)) return res.status(400).json({ message: "Invalid Room ID" });
    const project = await Project.findOne({ roomId: req.params.roomId });
    if (!project) return res.status(404).json({ message: "Room not found" });
    res.json(project);
  } catch (error) {
    console.error("Get project failed:", error);
    res.status(500).json({ message: "Could not load room" });
  }
});

router.put("/:roomId", async (req, res) => {
  try {
    if (!isRoomId(req.params.roomId)) return res.status(400).json({ message: "Invalid Room ID" });
    if (typeof req.body.code !== "string") return res.status(400).json({ message: "Code must be a string" });
    if (req.body.code.length > 100 * 1024) return res.status(400).json({ message: "Code exceeds 100KB limit" });

    const project = await Project.findOne({ roomId: req.params.roomId });
    if (!project) return res.status(404).json({ message: "Room not found" });
    if (project.ownerId.toString() !== req.user.userId) return res.status(403).json({ message: "Only the project owner can save" });

    project.code = req.body.code;
    project.updatedAt = new Date();
    await project.save();
    res.json(project);
  } catch (error) {
    console.error("Save project failed:", error);
    res.status(500).json({ message: "Could not save project" });
  }
});

export default router;
