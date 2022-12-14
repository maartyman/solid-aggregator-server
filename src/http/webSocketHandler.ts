import {HttpServer} from "./httpServer";
import {Message, server, connection} from "websocket";
import {loggerSettings} from "../utils/loggerSettings";
import {Logger} from "tslog";
import {QueryExecutor} from "incremunica";

export class WebSocketHandler {
  private readonly logger = new Logger(loggerSettings);
  private static instance: WebSocketHandler | null;
  private wsServer;
  private readonly protocolVersion = "1.0";
  private readonly generalProtocol = "solid-aggregator-" + this.protocolVersion;
  private readonly bindingProtocol = this.generalProtocol + "#bindings";
  private readonly readyProtocol = this.generalProtocol + "#ready";

  constructor() {
    this.wsServer = new server({
      httpServer: HttpServer.getInstance().server,
      autoAcceptConnections: false
    });

    this.wsServer.on('request', (request) => {
      /*
      //TODO do not auto accept make a origin allowed function
      if (!originIsAllowed(request.origin)) {
        // Make sure we only accept requests from an allowed origin
        request.reject();
        console.log((new Date()) + ' Connection from origin ' + request.origin + ' rejected.');
        return;
      }
       */

      const connection: connection = request.accept(request.requestedProtocols[0], request.origin);

      new Logger(loggerSettings).debug("Connection accepted.");
      connection.on('message', (message: Message) => {
        if (message.type === 'utf8') {
          const logger = new Logger(loggerSettings);
          logger.debug('Received Message: ' + message.utf8Data);
          let queryExecutor = QueryExecutor.factory.get(message.utf8Data);

          if (!queryExecutor) {
            connection.sendUTF("Query UUID doesn't exist.");
            return;
          }


          if (connection.protocol === this.readyProtocol || connection.protocol === this.generalProtocol) {
            queryExecutor.on("queryEvent", (event: string) => {
              logger.debug("queryEvent: " + event);
              if (event === "initialized") {
                logger.debug("sending initialized to client");
                connection.sendUTF("initialized");
              }
            });

            if (queryExecutor.isInitializationFinished()) {
              logger.debug("sending initialized to client");
              connection.sendUTF("initialized");
            }
          }

          if (connection.protocol === this.bindingProtocol || connection.protocol === this.generalProtocol) {
            queryExecutor.on("binding", (bindings, newBinding) => {
              let startWord = "";
              if (newBinding) {
                startWord = "added ";
              }
              else {
                startWord = "removed ";
              }
              connection.sendUTF(startWord + JSON.stringify(bindings));
            });

            queryExecutor.getData().then((bindings) => {
              if (bindings.length > 0){
                for (const binding of bindings) {
                  connection.sendUTF("added " + JSON.stringify(binding));
                }
              }
            });
          }
        }
      });
      connection.on('close', function(reasonCode, description) {
        new Logger(loggerSettings).debug(' Peer ' + connection.remoteAddress + ' disconnected.');
      });
    });
  }

  static setInstance() {
    if (this.instance == null) {
      this.instance = new WebSocketHandler();
    }
    return this.instance;
  }

  static getInstance() {
    if (this.instance == null) {
      throw new ReferenceError("HttpServer was not yet instantiated");
    }
    return this.instance;
  }

}
