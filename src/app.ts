import express from "express";
import cors from "cors";
import router from "./routes/index.js";
import { globalErrorHandler } from "./middlewares/globalError.middleware.js";
import { AppError } from "./utils/appError.js";

const app = express();

// Apply standard global middlewares
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Set up routing
app.use("/api/v1", router);

// Catch all unmatched routes
app.use((req, res, next) => {
  next(new AppError(`Can't find ${req.originalUrl} on this server!`, 404));
});

// Configure global error handler
app.use(globalErrorHandler);

export { app };
export default app;
