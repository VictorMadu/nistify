import { Method, ReqContext, ResContext, RestController } from "./interfaces";

class PostController implements RestController {
  getPath() {
    return "/user/ddd/:ddd";
  }
  getMethod() {
    return <Method>"GET";
  }

  async handle(reqContext: ReqContext, resContext: ResContext) {
    await reqContext.streamInBody();
    resContext.writeData({
      body: reqContext.getBody(),
      params: reqContext.getParams(),
      headers: reqContext.getHeaders(),
      query: reqContext.getQuery(),
    });
  }
}

export const restControllers: RestController[] = [new PostController()];
