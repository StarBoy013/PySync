import mongoose from "mongoose";

const projectSchema = new mongoose.Schema({
  roomId: { type: String, required: true, unique: true },
  projectName: { type: String, required: true, trim: true, maxlength: 80 },
  ownerId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  code: { type: String, default: "" },
  language: { type: String, enum: ["python"], default: "python" },
  updatedAt: { type: Date, default: Date.now }
});

export default mongoose.model("Project", projectSchema);
