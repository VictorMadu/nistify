import { IncomingHttpHeaders, IncomingMessage, OutgoingHttpHeaders, ServerResponse } from "http";
import {
  Method,
  Payload,
  ReqContext,
  ResContext,
  RestController,
  ControllerAdapter,
} from "./interfaces";

export class RestAPIAdapter implements ControllerAdapter {
  private routeTreeManager = new RouteTreeManager();
  private routeTreeNodeManager!: RouteTreeNodeManager;
  private incomingReqManager!: IncomingReqManager;
  private res!: ServerResponse;

  constructor(controllers: RestController[]) {
    for (let i = 0; i < controllers.length; i++) {
      this.attachController(controllers[i]);
    }
  }

  handle(req: IncomingMessage, res: ServerResponse): any {
    this.res = res;
    this.incomingReqManager = new IncomingReqManager(req);
    this.routeTreeNodeManager = this.routeTreeManager.getNodeManager(this.incomingReqManager);
    this.handleReq();
  }

  private attachController(restController: RestController) {
    this.routeTreeManager.store(new RouteTreeNodeManager(restController));
  }

  private handleReq() {
    if (this.incomingReqManager.isValidPath()) this.getControllerAndHandle();
    else this.res.writeHead(404).end();
  }

  private getControllerAndHandle() {
    const restController = this.routeTreeNodeManager.getRestController();
    this.incomingReqManager.setParamKeys(this.routeTreeNodeManager.getParamKeys());
    restController.handle(
      new ReqContextImpl(this.incomingReqManager),
      new ResContextImpl(this.res)
    );
  }
}

type RouteLeaf = RouteTreeNodeManager;
type RouteComposite = RouteLeaf | RouteNonLeaf;
type RouteNonLeaf = { [key: string]: RouteComposite };
type RouteDescendant = { [key: string]: RouteComposite };

class RouteTreeManager {
  private routeTree: Record<Method, RouteDescendant> = {
    GET: this.createRouteTreeParent(),
    POST: this.createRouteTreeParent(),
    PUT: this.createRouteTreeParent(),
    PATCH: this.createRouteTreeParent(),
    DELETE: this.createRouteTreeParent(),
  };

  store(routeTreeNodeManager: RouteTreeNodeManager) {
    this.buildRoutePathTree(routeTreeNodeManager);
  }

  getNodeManager(incomingReqManager: IncomingReqManager) {
    const traverser = this.createTraverserAndMoveToMethodSubTree(incomingReqManager);
    return this.getNodeManagerFromTraverser(traverser, incomingReqManager);
  }

  private createRouteTreeParent() {
    return {};
  }

  private buildRoutePathTree(routeTreeNodeManager: RouteTreeNodeManager) {
    const routeSubPaths = routeTreeNodeManager.getRouteSubPaths();
    const traverser = new RouteTreeForwardTraverser(this.routeTree, routeSubPaths);
    let path = <string>routeTreeNodeManager.getRestController().getMethod();

    do {
      path = traverser
        .setCurrSubTreeChild(path, this.createRouteTreeParent())
        .movePath()
        .moveDownTree(path)
        .getCurrPath();
    } while (!traverser.isLastPath());
    traverser.setCurrSubTreeChild(path, routeTreeNodeManager);
  }

  private createTraverserAndMoveToMethodSubTree(incomingReqManager: IncomingReqManager) {
    const incomingReqMethod = incomingReqManager.getMethod();
    const pathRoute = incomingReqManager.getPathRoute();
    const splittedPathWithoutPrefix = PathUtility.getSplitPathWithoutPrefix(pathRoute);

    let traverser = new RouteTreeForwardTraverser(this.routeTree, splittedPathWithoutPrefix);
    traverser = traverser.moveDownTree(incomingReqMethod); // moveDownTree because splittedPathWithoutPrefix does not start from root of routeTree. the root of routeTree is the method path
    return traverser;
  }

  private getNodeManagerFromTraverser(
    traverser: RouteTreeForwardTraverser,
    incomingReqManager: IncomingReqManager
  ) {
    // FIXME: Bug here
    while (this.goToNextPathInTraverser(traverser)) {
      const controllerPath = incomingReqManager.getControllerPath(traverser);

      if (traverser.hasChild(controllerPath)) traverser.moveDownTree(controllerPath);
      else {
        incomingReqManager.setIsNotValidPath();
        break;
      }
    }

    return <RouteLeaf>traverser.getCurrSubTree();
  }

  private goToNextPathInTraverser(traverser: RouteTreeForwardTraverser) {
    return traverser.movePath().getCurrPath();
  }
}

class RouteTreeForwardTraverser {
  private currPathIndex = -1;
  private currSubTree: RouteComposite;
  private lastIndex: number;

  constructor(root: RouteDescendant, private paths: readonly string[]) {
    this.currSubTree = root;
    this.lastIndex = paths.length - 1;
  }

  getCurrPath() {
    return this.paths[this.currPathIndex];
  }

  getCurrSubTree() {
    return this.currSubTree;
  }

  hasChild(childPath: string) {
    return this.getChild(childPath) != null;
  }

  isLastPath() {
    return this.lastIndex <= this.currPathIndex;
  }

  moveDownTree(childPath: string) {
    this.currSubTree = this.getChild(childPath);
    return this;
  }

  movePath() {
    ++this.currPathIndex;
    return this;
  }

  setCurrSubTreeChild(childPath: string, child: RouteComposite) {
    (<RouteDescendant>this.currSubTree)[childPath] = child;
    return this;
  }

  private getChild(childPath: string) {
    return (<RouteDescendant>this.currSubTree)[childPath];
  }
}

class RouteTreeNodeManager {
  private routeSubPaths: string[] = [];
  private paramKeys: string[] = [];

  constructor(private restController: RestController) {
    this.populateRoutesAndParamSubPaths();
  }

  getParamKeys(): Readonly<string[]> {
    return this.paramKeys;
  }

  getRestController() {
    return this.restController;
  }

  getRouteSubPaths(): Readonly<string[]> {
    return this.routeSubPaths;
  }

  private populateRoutesAndParamSubPaths() {
    const splittedPathWithoutPrefix = this.getSplittedPathWithoutPrefix();

    for (let i = 0; i < splittedPathWithoutPrefix.length; i++) {
      const subPath = splittedPathWithoutPrefix[i];
      let routeSubPath = subPath;

      if (this.isParamSubPath(subPath)) {
        this.addParamSubPathNameToParamsKey(subPath);
        routeSubPath = this.getParamSubRouteSubstitue();
      }
      this.routeSubPaths.push(routeSubPath);
    }
  }

  private isParamSubPath(subPath: string) {
    return PathUtility.isParamSubPath(subPath);
  }

  private getParamSubRouteSubstitue() {
    return PathUtility.getRouteControllerParamSubRouteSubstitue();
  }

  private addParamSubPathNameToParamsKey(paramSubPath: string) {
    const paramName = this.getParamName(paramSubPath);
    this.paramKeys.push(paramName);
  }

  private getParamName(subPath: string) {
    return PathUtility.getParamSubPathWithoutParamPrefix(subPath);
  }

  private getSplittedPathWithoutPrefix() {
    const path = this.restController.getPath();
    return PathUtility.getSplitPathWithoutPrefix(path);
  }
}

class ReqContextImpl implements ReqContext {
  private queryRegExp = /(?<key>[^=]+)=(?<value>[^&]+)/g;
  private rawBody: string = "";
  private req: IncomingMessage;
  private rawQuery: string;
  private paramKeys: readonly string[];
  private paramValues: readonly string[]; // TODO: Check if params coming from req can be of other types other than string

  constructor(incomingReqManager: IncomingReqManager) {
    this.paramKeys = incomingReqManager.getParamKeys();
    this.paramValues = incomingReqManager.getParamValues();
    this.req = incomingReqManager.getReq();
    this.rawQuery = incomingReqManager.getPathQuery();
  }

  async streamInBody() {
    this.req.setEncoding("utf-8");
    return new Promise((resolve, reject) => {
      this.req.on("data", (chunk: string) => {
        this.rawBody += chunk;
      });
      this.req.on("end", resolve);
      this.req.on("error", reject);
    });
  }

  getHeaders<T extends IncomingHttpHeaders = IncomingHttpHeaders>() {
    return <T>this.req.headers;
  }

  getQuery<T extends Payload = Payload>() {
    let query = <T>{};
    let match: RegExpExecArray | null;

    while ((match = this.queryRegExp.exec(this.rawQuery))) {
      const { key, value } = <{ key: string; value: string }>(<RegExpExecArray>match).groups;
      query = <T>this.setPropOfObj(query, key, value);
    }

    return query;
  }

  getBody<T extends Payload = Payload>() {
    return <T>JSON.parse(this.rawBody);
  }

  getParams<T extends Payload = Payload>() {
    let params = <T>{};

    for (let i = 0; i < this.paramKeys.length; i++) {
      const key = this.paramKeys[i];
      const value = this.paramValues[i];
      params = <T>this.setPropOfObj(params, key, value);
    }
    return params;
  }

  getReadStream() {
    return this.req;
  }

  private setPropOfObj(obj: Payload, key: string, value: Payload[string]) {
    obj[key] = value;
    return obj;
  }
}

class ResContextImpl implements ResContext {
  constructor(private res: ServerResponse) {}

  writeHeader(statusCode: number, headers: OutgoingHttpHeaders) {
    this.res.writeHead(statusCode, headers);
    return this;
  }

  writeData(data: Object) {
    this.res.end(JSON.stringify(data));
  }

  getWriteStream() {
    return this.res;
  }
}

// TODO: this should implement to interfaces, one for the ReqContext and another for the TreeNodeManager or something like that
class IncomingReqManager {
  private method: Method = "GET";
  private paramValues: string[] = [];
  private paramKeys: readonly string[] = [];
  private route!: string;
  private query!: string;
  private isBadPath = false;

  constructor(private req: IncomingMessage) {
    this.createMethod();
    this.createPathObjs();
  }

  getMethod() {
    return this.method;
  }

  getParamValues(): readonly string[] {
    return this.paramValues;
  }

  getParamKeys(): readonly string[] {
    return this.paramKeys;
  }

  getPathRoute() {
    return this.route;
  }

  getPathQuery() {
    return this.query;
  }

  getReq() {
    return this.req;
  }

  isValidPath() {
    return this.isBadPath;
  }

  setIsNotValidPath() {
    this.isBadPath = true;
    return this;
  }

  setParamKeys(paramKeys: readonly string[]) {
    this.paramKeys = paramKeys;
  }

  getControllerPath(traverser: RouteTreeForwardTraverser) {
    const path = traverser.getCurrPath();
    if (this.isParamSubPath(traverser)) {
      return this.handleAndGetControllerPathForParam(path);
    }
    return path;
  }

  private createMethod() {
    const method = <Method>this.req.method;
    if (method) this.method = method;
  }

  private createPathObjs() {
    const pathRegExp = /^(?<pathRoute>.*)(\/$|\?)(?<pathQuery>.*)$/;
    const path = decodeURIComponent(this.req.url ?? "");
    const match = path.match(pathRegExp);

    if (match == null) return;
    if (match) {
      const pathConfig = <{ pathRoute: string; pathQuery: string }>match.groups;
      this.route = pathConfig.pathRoute;
      this.query = pathConfig.pathQuery;
    }
  }

  private isParamSubPath(traverser: RouteTreeForwardTraverser) {
    const subRouteTree = traverser.getCurrSubTree();
    const subPath = traverser.getCurrPath();

    return (<RouteDescendant>subRouteTree)[subPath] == null;
  }

  private handleAndGetControllerPathForParam(paramPath: string) {
    this.storePathAsParamValue(paramPath);
    return this.getControllerPathForParam();
  }

  private storePathAsParamValue(incomingReqPath: string) {
    this.paramValues.push(incomingReqPath);
  }

  private getControllerPathForParam() {
    return PathUtility.getRouteControllerParamSubRouteSubstitue();
  }
}

class PathUtility {
  private static PARAM_PREFIX = ":";
  private static SLASH = "/";

  static getRouteControllerParamSubRouteSubstitue() {
    return "\u0000";
  }

  static getParamSubPathWithoutParamPrefix(paramSubPath: string) {
    return paramSubPath.substring(PathUtility.PARAM_PREFIX.length);
  }

  static getPathWithoutPrefix(path: string) {
    return path.substring(PathUtility.SLASH.length);
  }

  static getSplitPath(pathOrSubPath: string) {
    return pathOrSubPath.split(PathUtility.SLASH);
  }

  static getSplitPathWithoutPrefix(path: string) {
    const pathWithoutPrefix = PathUtility.getPathWithoutPrefix(path);
    return PathUtility.getSplitPath(pathWithoutPrefix);
  }

  static hasPathPrefix(pathOrSubPath: string) {
    return PathUtility.hasPrefix(pathOrSubPath, PathUtility.SLASH);
  }

  static isParamSubPath(subPath: string) {
    return PathUtility.hasPrefix(subPath, PathUtility.PARAM_PREFIX);
  }

  private static getPrefix(path: string, prefix: string) {
    return path.substring(0, prefix.length);
  }

  private static hasPrefix(path: string, prefix: string) {
    return PathUtility.getPrefix(path, prefix) === prefix;
  }
}
