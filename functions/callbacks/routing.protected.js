const path = Runtime.getAssets()['/providers/customers.js'].path;
const { findWorkerForCustomer, findRandomWorker } = require(path);

exports.handler = async function(context, event, callback) {
    let client = context.getTwilioClient();

    console.log("Frontline Routing Callback");
    console.log(JSON.stringify(event));

    try {
        const conversationSid = event.ConversationSid;
        const customerNumber = event['MessagingBinding.Address'];
    
        const workerIdentity = await routeConversation(context, conversationSid, customerNumber);
        const resp = await routeConversationToWorker(client, conversationSid, workerIdentity);

        callback(null, resp);
    } catch(err) {
        callback(err);
    }
};

const routeConversation = async (context, conversationSid, customerNumber) => {
    let workerIdentity = await findWorkerForCustomer(context, customerNumber);

    if (!workerIdentity) { // Customer doesn't have a worker

        // Select a random worker
        console.log('no worker identity...')
        workerIdentity = await findRandomWorker(context);

        // Or you can define default worker for unknown customers.
        // workerIdentity = 'john@example.com'

        if (!workerIdentity) {
            throw new Error(`Routing failed, please add workers to customersToWorkersMap or define a default worker. Conversation SID: ${conversationSid}`)
        }
    }

    return workerIdentity;    
}

const routeConversationToWorker = async (client, conversationSid, workerIdentity) => {
    // Add worker to the conversation with a customer
    await client.conversations
        .conversations(conversationSid)
        .participants
        .create({ identity: workerIdentity })
        .then(participant => console.log('Create agent participant: ', participant.sid))
        .catch(e => console.log('Create agent participant: ', e));
}