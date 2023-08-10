import express from "express";
import cors from "cors";
import ViteExpress from "vite-express";
import { routes } from "./routes/routes";

const app = express();

app.use(cors());
app.use(express.json());

routes(app);

ViteExpress.listen(app, 3000, () =>
	console.log("Server is listening on port 3000...")
);
