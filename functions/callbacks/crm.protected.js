const customersPath = Runtime.getAssets()["/providers/customers.js"].path;
const { getCustomerById, getCustomersList } = require(customersPath);

exports.handler = async function (context, event, callback) {
  const location = event.Location;

  // Location helps to determine which information was requested.
  // CRM callback is a general purpose tool and might be used to fetch different kind of information
  switch (location) {
    case "GetCustomerDetailsByCustomerId": {
      const resp = await handleGetCustomerDetailsByCustomerIdCallback(
        event,
        context
      );
      callback(null, resp);
      break;
    }
    case "GetCustomersList": {
      const resp = await handleGetCustomersListCallback(context, event);
      callback(null, resp);
      break;
    }

    default: {
      console.log("Unknown location: ", location);
      callback(422, `Unknown location:  ${location}`);
    }
  }
};

const handleGetCustomerDetailsByCustomerIdCallback = async (event, context) => {
  const body = event.body;
  console.log("Getting Customer details: ", event.CustomerId);

  const customerId = event.CustomerId;

  // Fetch Customer Details based on his ID
  // and information about a worker, that requested that information
  const customerDetails = await getCustomerById(context, customerId);
  console.log(customerDetails);
  // Respond with Contact object
  return {
    objects: {
      customer: {
        customer_id: customerDetails.customer_id,
        display_name: customerDetails.display_name,
        channels: customerDetails.channels,
        links: customerDetails.links,
        avatar: customerDetails.avatar,
        details: customerDetails.details,
      },
    },
  };
};

const handleGetCustomersListCallback = async (context, event) => {
  console.log("Getting Customers list");

  const body = event.body;
  const workerIdentity = event.Worker;
  const pageSize = event.PageSize;
  const anchor = event.Anchor || 0;

  // Fetch Customers list based on information about a worker, that requested it
  const customersList = await getCustomersList(
    context,
    workerIdentity,
    pageSize,
    anchor
  );
  console.log(customersList);

  // Respond with Customers object
  return {
    objects: {
      customers: customersList,
    },
  };
};
