import OpenAI from "openai";
import type { EasyInputMessage } from "openai/resources/responses/responses.mjs";
import { config } from "./config";

const client = new OpenAI();

class ChatSession {

    private previousResponseId: string | undefined;

    async query(input: string): Promise<[string, number]> {
        const inputs: Array<EasyInputMessage> = [];
        if (this.previousResponseId === undefined) {
            inputs.push({role: 'system', content: 'You are a helpful assistant in the guise of a wise frog. Put your responses in html tags.'})
        }
        inputs.push({role: 'user', content: input});
        const response = await client.responses.create({
            model: config.gptModel,
            previous_response_id: this.previousResponseId,
            input: inputs,
            store: true
        });
        this.previousResponseId = response.id;
        return Promise.resolve([response.output_text, response.usage?.total_tokens ?? 1000]);
    }
}

const sessions: Map<string, ChatSession> = new Map();

export function queryChatSession(query: string, sessionId: string): Promise<[string, number]> {
    let session = sessions.get(sessionId);
    if (session === undefined) {
        session = new ChatSession()
        sessions.set(sessionId, session);
    }
    return session.query(query);
}