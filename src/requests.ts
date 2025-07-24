import { parse } from "yaml";

export enum RequestType {
    COMMAND,
    CHATGPT_QUERY
}

export interface AgentRequest {
    type: RequestType;
}

const VALID_COMMANDS = ['help', 'info', 'set-config', 'set-user-config'];

export class CommandRequest implements AgentRequest {

    type: RequestType = RequestType.COMMAND;

    parseErr: string | undefined;
    password: string | undefined;
    command: string | undefined;
    fields: Map<string, any> = new Map();

    constructor (public commandBody: string) {
        try {
            const input = parse(commandBody);
            if (!(input instanceof Object)) {
                throw Error('Commmand input not in key: value format');
            }
            this.password = input['password'];
            if (!this.password) {
                throw Error('Password required');
            }
            this.command = input['command'];
            if (!this.command) {
                throw Error('Command required');
            }
            if (!VALID_COMMANDS.includes(this.command)) {
                throw Error('Invalid command');
            }
            for (const key in input) {
                if (key === 'password' || key === 'command') continue;
                this.fields.set(key, input[key]);
            }
        } catch(err) {
            this.parseErr = String(err);
        }
    }
}

export class ChatGPTRequest implements AgentRequest {
    public type: RequestType = RequestType.CHATGPT_QUERY;
    public constructor (public query: string) {}
}

export function isCommandRequest(req: AgentRequest): req is CommandRequest {
    return req.type == RequestType.COMMAND;
}

export function isChatGPTRequest(req: AgentRequest): req is ChatGPTRequest {
    return req.type == RequestType.CHATGPT_QUERY;
}