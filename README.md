# email-agent

A server to monitor an email mailbox and relay conversations with ChatGPT. Includes an admin command interface and a SQLite backed database for user metrics and configuration. 

To install dependencies:

```
curl -fsSL https://bun.sh/install | 
bun install
```

Make a .env file to set environment variables:
```
EMAIL_AGENT_USER=<email for client to use>
EMAIL_AGENT_PW=<password for mailbox>
EMAIL_AGENT_ADMIN_PW=<admin password to use>
OPENAI_API_KEY=<API key for ChatGPT>
```

To start the server run:

```
bun start
```

To test in the command line run:

```
bun start test
```
