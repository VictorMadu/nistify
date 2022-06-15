import {
  IncomingHttpHeaders,
  IncomingMessage,
  OutgoingHttpHeaders,
  Server,
  ServerResponse,
} from "http";
import { Stream } from "stream";

export interface Config {
  port: number;
  requestTimeout: number;
}

export interface AppConfigManager {
  getConfig(): Promise<Config>;
}

export type Payload = Record<string, string | number | boolean>;

export interface ReqContext {
  getHeaders<T extends IncomingHttpHeaders = IncomingHttpHeaders>(): T;
  getParams<T extends Payload = Payload>(): T;
  getQuery<T extends Payload = Payload>(): T;
  getBody<T extends Payload = Payload>(): T;
  getReadStream(): Stream;
  streamInBody(): Promise<any>;
}

export interface ResContext {
  writeHeader(statusCode: number, header: OutgoingHttpHeaders): ResContext;
  writeData(data?: Object): void;
  getWriteStream(): Stream;
}

export interface Controller {
  handle(reqContext: ReqContext, resContext: ResContext): void | Promise<void>;
}

export type Method = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

export interface RestController extends Controller {
  getPath(): string;
  getMethod(): Method;
}

export interface ControllerAdapter {
  handle(req: IncomingMessage, res: ServerResponse): void;
}
