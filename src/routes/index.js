import users from "./api/users.js";
import admin from "./api/admin.js";

export default function (app) {
  app.use("/api", users);
  app.use("/admin", admin);
}
