# Set up a free ServiceNow developer instance

ServiceNow gives free "Personal Developer Instances" (PDIs) to members of its Developer Program for learning and testing. It's a real ServiceNow with admin access. Business or production use isn't allowed, which is fine for a portfolio project.

## 1. Get the instance (about 10 minutes)

1. Go to https://developer.servicenow.com and choose **Sign up** (or sign in). You create a free ServiceNow ID with your email.
2. After signing in, choose **Request Instance** (it may say "Start building"). Pick the latest release.
3. When it's ready, the page shows the **instance URL** (like `https://dev12345.service-now.com`), the user name **admin**, and a password. Copy them somewhere safe. You can reset the admin password from the developer site if you lose it.

## 2. Keep it alive

- An unused instance goes to sleep. If the app says the instance is asleep, open the developer site and wake it.
- ServiceNow can take back an instance that is over 90 days old if you haven't signed in to it for 10 days. Sign in to the instance itself (not just the developer site) at least once a week. Everything this project needs is in this repo, so a lost instance can be rebuilt with `npm run sn:kb` and `npm run sn:seed`.

## 3. Connect this project

Copy `.env.example` to `.env` and fill in:

```
SN_INSTANCE=https://dev12345.service-now.com
SN_USER=admin
SN_PASSWORD=the password from step 1
TECH_NAME=Your Name
```

`.env` is in `.gitignore`, so it is never committed.

Then:

```bash
npm run sn:check           # should say "Connected to ..."
npm run sn:kb -- --yes     # adds the 15 EN/ES articles as drafts in the "IT" knowledge base
npm run sn:seed -- --yes   # adds 8 demo incidents
npm run review             # triage them
```

## 4. Check the result in ServiceNow

Open **Incident > Open** in the instance. Approved incidents have the new impact, urgency, priority and category, and an internal **work note** that starts with "[AI triage suggestion, approved by ...]". If you chose "send reply", the reply is in **Additional comments** (visible to the user).

## Better practice for a real company

The admin account is fine for a personal lab. In a real company you'd create a dedicated integration user with only the `itil` role (read and update incidents) and use OAuth instead of a password.
