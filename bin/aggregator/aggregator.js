"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.Aggregator = void 0;
const tslog_1 = require("tslog");
const events_1 = require("events");
const loggerSettings_1 = require("../utils/loggerSettings");
const reasoning_context_entries_1 = require("@comunica/reasoning-context-entries");
const n3_1 = require("n3");
const guardKeeper_1 = require("../guarding/guardKeeper");
class Aggregator extends events_1.EventEmitter {
    //private readonly tripleStore = new Store();
    constructor(queryExplanation, UUID) {
        super();
        this.logger = new tslog_1.Logger(loggerSettings_1.loggerSettings);
        this.results = new Array();
        this.queryEngineBuild = false;
        this.queryFinished = false;
        this.reevaluateResources = new Array();
        this.queryExplanation = queryExplanation;
        this.UUID = UUID;
        this.on("queryEvent", (message) => {
            if (message === "done" && this.reevaluateResources.length > 0) {
                this.executeQuery();
            }
        });
        //this.QueryEngineFactory = require(this.queryExplanation.comunicaVersion? this.queryExplanation.comunicaVersion : "@comunica/query-sparql-link-traversal").QueryEngineFactory;
        this.logger.debug("comunicaVersion = " + queryExplanation.comunicaVersion);
        const queryEngineFactory = require(queryExplanation.comunicaVersion.toString()).QueryEngineFactory;
        this.logger.debug("comunica context path = " + queryExplanation.comunicaContext);
        new queryEngineFactory().create({
            configPath: queryExplanation.comunicaContext,
        }).then((queryEngine) => {
            this.queryEngine = queryEngine;
        }).finally(() => {
            this.logger.debug(`Comunica engine build`);
            this.queryEngineBuild = true;
            this.emit("queryEngineEvent", "build");
            this.executeQuery();
        });
    }
    executeQuery() {
        return __awaiter(this, void 0, void 0, function* () {
            this.queryFinished = false;
            this.logger.debug(`Starting comunica query, with query: \n${this.queryExplanation.queryString.toString()}`);
            if (this.queryEngine == undefined) {
                throw new TypeError("queryEngine is undefined");
            }
            this.logger.debug(`Starting comunica query, with reasoningRules: \n${this.queryExplanation.reasoningRules.toString()}`);
            let parallelPromise = new Array();
            for (const resource of this.reevaluateResources) {
                parallelPromise.push(this.queryEngine.invalidateHttpCache(resource));
            }
            this.reevaluateResources.splice(0);
            yield Promise.all(parallelPromise);
            const bindingsStream = yield this.queryEngine.queryBindings(this.queryExplanation.queryString.toString(), {
                sources: this.queryExplanation.sources,
                [reasoning_context_entries_1.KeysRdfReason.implicitDatasetFactory.name]: () => new n3_1.Store(),
                [reasoning_context_entries_1.KeysRdfReason.rules.name]: this.queryExplanation.reasoningRules.toString(),
                fetch: this.customFetch.bind(this),
                lenient: this.queryExplanation.lenient
            });
            bindingsStream.on('data', (binding) => {
                //TODO handle delete not only additions
                this.logger.debug(`on data: ${binding.toString()}`);
                this.results.push(binding);
                this.emit("binding", [binding]);
            });
            bindingsStream.on('end', () => {
                this.queryFinished = true;
                this.logger.debug(`Comunica query finished`);
                this.emit("queryEvent", "done");
            });
            bindingsStream.on('error', (error) => {
                //TODO solve error
                this.logger.error(error);
                this.emit("queryEvent", "error");
            });
        });
    }
    customFetch(input, init) {
        guardKeeper_1.GuardKeeper.getInstance().addGuard(input.toString(), this);
        return fetch(input, init);
    }
    dataChanged(resource) {
        this.reevaluateResources.push(resource);
        if (this.queryFinished) {
            this.executeQuery();
        }
    }
    getData() {
        return this.results;
    }
    isQueryEngineBuild() {
        return this.queryEngineBuild;
    }
    isQueryFinished() {
        return this.queryFinished;
    }
}
exports.Aggregator = Aggregator;