import { parse, stringify } from "yaml"

export interface Config {
    mode: string
    gptModel: string,
    blackList: string[],
    whiteList: string[],
    defaultTokensLimit: number
}

export let config: Config = {
    mode: 'enabled',
    gptModel: 'gpt-4.1',
    blackList: [],
    whiteList: [],
    defaultTokensLimit: 250000
}

export function getConfigYaml() { return stringify(config); }

export function setConfigFromYaml (yaml: string) {
    config = parse(yaml);
}

export const configEnums = {
    mode: ['enabled', 'disabled'],
    gptModel: ['gpt-4.1', 'gpt-3.5-turbo']
}

export function setConfig(key: keyof Config, value: Config[keyof Config]) {
    try {
        if (key in configEnums && !((configEnums as any)[key]).includes(value)) {
            throw Error(`Options are ${(configEnums as any)[key]}`);
        }
        if (Array.isArray(config[key])) {
            if (!Array.isArray(value)) {
                throw Error('Must be array value');
            }
            const emailRegex = /^([^\s@]+)?@[^\s@]+\.[^\s@]+$/;
            let configItems: string[] = [];
            for (const item of value) {
                if (typeof item !== 'string') {
                    throw Error(`Array item "${item}" must be string`);
                }
                if (item === '...') {
                    config[key].forEach(item => configItems.push(item));
                } else {
                    if (!emailRegex.test(item)) {
                        throw Error(`Array item "${item}" must be an email or email domain`);
                    }
                    configItems.push(item);
                }
            }
            (config[key] as Config[typeof key]) = configItems;
        } else {
            (config[key] as Config[typeof key]) = value;
        }
    } catch(err) {
        if (err instanceof Error) {
            throw Error(`Cannot set config value ${key} to "${value}"\n${err.message}`);
        }
    }
}