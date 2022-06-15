import http from "http";
import { JsonAppConfigManager } from "./config-manager";
import { Config, Controller } from "./interfaces";
import { RestAPIAdapter } from "./rest-adapter";
import { restControllers } from "./controllers";

// TODO: Add unit testing
export class ServerManager {
  private server = http.createServer();
  private config!: Config;
  private restAPIAdapter!: RestAPIAdapter;

  private constructor() {}

  static async startServer() {
    return (await new ServerManager().loadConfig())
      .loadControllersAndServices()
      .setServerConfig()
      .setActionForServerEvents()
      .startListening();
  }

  private async loadConfig() {
    this.config = await new JsonAppConfigManager().getConfig();
    return this;
  }

  private loadControllersAndServices() {
    this.restAPIAdapter = new RestAPIAdapter(restControllers);
    return this;
  }

  private setServerConfig() {
    this.server.requestTimeout = this.config.requestTimeout;
    return this;
  }

  private setActionForServerEvents() {
    this.setOnConnectionAction();
    this.setOnListeningAction();
    this.setOnRequestAction();
    this.setOnCloseAction();
    return this;
  }

  private setOnConnectionAction() {
    this.server.on("connection", () => {});
  }

  private setOnListeningAction() {
    this.server.on("listening", () => {
      console.log("Server has started listening to connections");
    });
  }

  private setOnRequestAction() {
    this.server.on("request", (req, res) => {
      this.restAPIAdapter.handle(req, res);
    });
  }

  private setOnCloseAction() {
    this.server.on("close", () => {
      console.log("Server has closed");
    });
  }

  startListening() {
    const port = this.config.port;
    this.server.listen(port, () => {
      console.log("Server listening with network address config", this.server.address());
    });
  }
}
