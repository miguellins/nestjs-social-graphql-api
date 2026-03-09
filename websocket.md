# HOW TO USE WEBSOCKET

## STEP 1

### ENTER THE GRAPHQL WS URL

ws://localhost:3000/graphql

---

## STEP 2

### CLICK CONNECT

Postman opens a raw WebSocket connection, but for graphql-ws subscriptions you still need to send the protocol messages manually as JSON frames.

---

## STEP 3

### SEND THE connection_init MESSAGE

```JSON
{
  "type": "connection_init",
  "payload": {
    "authorization": "Bearer YOUR_JWT_TOKEN"
  }
}
```

### WHAT YOU SHOULD SEE BACK:

```JSON
{
  "type": "connection_ack"
}
```

---

## STEP 5

### START THE SUBSCRIPTION

After the ack, send a subscribe message.

```JSON
{
  "id": "1",
  "type": "subscribe",
  "payload": {
    "query": "
    subscription NotificationReceived {
      notificationReceived {
        id
        type
        title
        body
        isRead
        readAt
        entityId
        actorId
        recipientId
        createdAt
        updatedAt
        actor {
          id
          username
          name
        }
      }
    }"
  }
}
```

---

## STEP 6

### TRIGGER THE EVENT FROM ANOTHER REQUEST

Keep that WebSocket tab open

In another Postman tab, or another client:

- log in different user
- call your createFollow mutation or createLike mutation

---

## STEP 7

### WATCH THE WEBSOCKET MESSAGES

If it works, Postman should receive a message shaped roughly like:

```JSON
{
  "id": "1",
  "type": "next",
  "payload": {
    "data": {
      "notificationReceived": {
        "id": 123,
        "type": "USER_FOLLOWED",
        "title": "New follower"
      }
    }
  }
}
```

## STEP 8

### OPTIONAL STOP MESSAGE

When youre done, you can stop the subscription with:

```JSON
{
  "id": "1",
  "type": "complete"
}
```
