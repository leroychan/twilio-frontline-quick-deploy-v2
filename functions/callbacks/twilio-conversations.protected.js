const path = Runtime.getAssets()["/providers/customers.js"].path;
const { getCustomerByNumber, updateConsentByCustomerId } = require(path);
const sgMail = require("@sendgrid/mail");
sgMail.setApiKey(process.env.SENDGRID_API_KEY);
const sendgridEmailFrom = process.env.SENDGRID_EMAIL_FROM;

exports.handler = async function (context, event, callback) {
  console.log("Conversations Callback");
  console.log(event);
  const client = context.getTwilioClient();
  const eventType = event.EventType;

  switch (eventType) {
    case "onConversationAdd": {
      console.log("In onConversationAdd Added");
      /* PRE-WEBHOOK
       *
       * This webhook will be called before creating a conversation.
       *
       * It is required especially if Frontline Inbound Routing is enabled
       * so that when the worker will be added to the conversation, they will
       * see the friendly_name and avatar of the conversation.
       *
       * More info about the `onConversationAdd` webhook: https://www.twilio.com/docs/conversations/conversations-webhooks#onconversationadd
       * More info about handling incoming conversations: https://www.twilio.com/docs/frontline/handle-incoming-conversations
       */
      const customerNumber = event["MessagingBinding.Address"];
      const isIncomingConversation = !!customerNumber;

      if (isIncomingConversation) {
        try {
          let customerDetails =
            (await getCustomerByNumber(context, customerNumber)) || {};
          const conversationProperties = {
            friendly_name: customerDetails.display_name || customerNumber,
            attributes: JSON.stringify({
              avatar: customerDetails.avatar,
            }),
          };
          console.log("Debug 3");
          console.log(conversationProperties);
          callback(null, conversationProperties);
        } catch (err) {
          console.log("Error: onConversationAdd");
          callback(err);
        }
      }
      callback(null, "success");
      break;
    }
    case "onParticipantAdded": {
      console.log("In onParticipant Added");
      /* POST-WEBHOOK
       *
       * This webhook will be called when a participant added to a conversation
       * including customer in which we are interested in.
       *
       * It is required to add customer_id information to participant and
       * optionally the display_name and avatar.
       *
       * More info about the `onParticipantAdded` webhook: https://www.twilio.com/docs/conversations/conversations-webhooks#onparticipantadded
       * More info about the customer_id: https://www.twilio.com/docs/frontline/my-customers#customer-id
       * And more here you can see all the properties of a participant which you can set: https://www.twilio.com/docs/frontline/data-transfer-objects#participant
       */
      const conversationSid = event.ConversationSid;
      const participantSid = event.ParticipantSid;
      const customerNumber = event["MessagingBinding.Address"];
      const isCustomer = customerNumber && !event.Identity;

      if (isCustomer) {
        try {
          const customerParticipant = await client.conversations
            .conversations(conversationSid)
            .participants.get(participantSid)
            .fetch();

          const customerDetails =
            (await getCustomerByNumber(context, customerNumber)) || {};
          await setCustomerParticipantProperties(
            customerParticipant,
            customerDetails
          );
          console.log(customerDetails);
          callback(null, "success");
        } catch (err) {
          console.log("Error: onParticipantAdded");
          callback(err);
        }
      }
      callback(null, "success");
      break;
    }
    case "onMessageAdd": {
      console.log("In onMessageAdd");
      // General
      const twilio = context.getTwilioClient();
      const participant = await getConversationParticipant(twilio, event);
      const participant_number = participant.messagingBinding.address;
      const customer = await getCustomerByNumber(context, participant_number);
      const customerConsentStatus = customer.details.consent || false;
      if (isFrontlineWorker(event)) {
        /**
         *
         * Workflow for Workers
         *
         **/
        // Check Consent Status
        if (!customerConsentStatus) {
          const overrideMessage = {
            body: 'You opted into receiving communications from us online. Would you like to receive more information from us? Reply "Yes" to continue',
            author: event.Author,
          };
          callback(null, overrideMessage);
        }
        // Check Filtered - Backline
        if (event.Body && event.Body.toLowerCase().indexOf("backline") > -1) {
          const emailBody = {
            to: "lechan+frontlinedemo@twilio.com",
            from: sendgridEmailFrom,
            subject: "[Frontline Demo] Non-Compliant Word(s) Alert",
            text: `The following worker (${event.Author}) has tried to send a non-compliant word ("backline") to ${customer.display_name}.`,
          };
          try {
            const sendEmailResult = await sgMail.send(emailBody);
            console.log(sendEmailResult[0]);
          } catch (err) {
            console.log("Unable to send email");
            console.log(err);
          }
          callback(422, "Filtered Words Detected");
        }
      }
      {
        /**
         *
         * Workflow for Customer
         *
         **/
        if (event.Body && event.Body.toLowerCase().indexOf("yes") > -1) {
          if (!customerConsentStatus) {
            await updateConsentByCustomerId(
              context,
              customer.details.record_id,
              {
                consent: true,
              }
            );
            await trackSegment(
              context,
              participant_number,
              customer,
              "Consent Given"
            );
          }
        }
      }
      // Catch All - Success
      callback(null, true);
    }
    default: {
      callback(422, `Unknown location: location`);
    }
  }
};

const setCustomerParticipantProperties = async (
  customerParticipant,
  customerDetails
) => {
  const participantAttributes = JSON.parse(customerParticipant.attributes);
  const customerProperties = {
    attributes: JSON.stringify({
      ...participantAttributes,
      avatar: participantAttributes.avatar || customerDetails.avatar,
      customer_id:
        participantAttributes.customer_id || customerDetails.customer_id,
      display_name:
        participantAttributes.display_name || customerDetails.display_name,
    }),
  };

  // If there is difference, update participant
  if (customerParticipant.attributes !== customerProperties.attributes) {
    // Update attributes of customer to include customer_id
    await customerParticipant
      .update(customerProperties)
      .catch((e) => console.log("Update customer participant failed: ", e));
  }
};

function isFrontlineWorker(event) {
  return event.ClientIdentity ? true : false;
}

async function getConversationParticipant(twilio, event) {
  const participants = await twilio.conversations
    .conversations(event.ConversationSid)
    .participants.list();
  for (const p of participants) {
    if (!p.identity && p.messagingBinding)
      if (p.messagingBinding.proxy_address) return p;
  }
  for (const p of participants) {
    if (p.sid == event.ParticipantSid) return p;
  }
}

async function trackSegment(context, customer_number, customer, event) {
  var Analytics = require("analytics-node");
  var analytics = new Analytics(context.SEGMENT_WRITE_KEY, { flushAt: 2 });
  analytics.flushed = true;
  analytics.identify({
    userId: customer_number,
    traits: {
      name: customer.display_name,
    },
  });
  analytics.track({
    userId: customer_number,
    event: event,
    properties: {
      application: "frontline-demo",
      type: "messaging",
    },
  });
  await analytics.flush(function (err, batch) {
    console.log("Flushed, and now this program can exit!");
  });
}

// module.exports = conversationsCallbackHandler;
