import { defineConfig } from "@playwright/test";
import { fileURLToPath } from "node:url";
const python =
  '"' +
  fileURLToPath(
    new URL(
      process.platform === "win32"
        ? "../api/.venv/Scripts/python.exe"
        : "../api/.venv/bin/python",
      import.meta.url,
    ),
  ) +
  '"';
export default defineConfig({
  testDir: "./e2e",
  workers: 1,
  use: {
    baseURL: "http://127.0.0.1:5173",
    channel: process.env.CI ? undefined : "chrome",
    screenshot: "only-on-failure",
  },
  webServer: [
    {
      cwd: fileURLToPath(new URL("../api/", import.meta.url)),
      command:
        python +
        " manage.py migrate --settings=config.settings_smoke && " +
        python +
        " manage.py prepare_smoke --settings=config.settings_smoke && " +
        python +
        " manage.py runserver 127.0.0.1:8000 --noreload --settings=config.settings_smoke",
      url: "http://127.0.0.1:8000/api/session/",
      reuseExistingServer: false,
      timeout: 60000,
    },
    {
      command: "npm run preview -- --host 127.0.0.1 --port 5173 --strictPort",
      url: "http://127.0.0.1:5173",
      reuseExistingServer: false,
    },
  ],
});
