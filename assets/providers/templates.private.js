const mergeFields = (templateString, customerDetails) => {
  try {
    // Get all {{text}} instances
    function replacer(match) {
      match = match.replace(/{{/, "");
      match = match.replace(/}}/, "");
      if (customerDetails.hasOwnProperty(match)) {
        return customerDetails[match];
      }

      return `${match} is blank`;
    }

    // const result = templateString.replace(/(?<=\{{).+?(?=\}})/, replacer);
    const result = templateString.replace(/{{(.+?)}}/g, replacer);
    return result;
  } catch (err) {
    console.log(err);
  }
};

const getTemplates = async (context, customerDetails) => {
  const Airtable = require("airtable");
  const base = new Airtable({ apiKey: context.AIRTABLE_API_KEY }).base(
    context.AIRTABLE_BASE_ID
  );

  return new Promise((resolve, reject) => {
    let templates = {};

    base("Templates")
      .select({
        view: "Grid view",
        pageSize: 100,
      })
      .eachPage(
        function page(records, fetchNextPage) {
          // This function (`page`) will get called for each page of records.
          console.log("Loop Template Records:");
          records.forEach(function (record) {
            const category = record.get("category");
            const text = record.get("text");
            const whatsAppApproved = record.get("whatsAppApproved") || false;

            console.log(`${category} [WA: ${whatsAppApproved}]: ${text}`);
            let mergedText = mergeFields(text, customerDetails);

            if (!templates.hasOwnProperty(category)) {
              const entry = {
                display_name: category,
                templates: [
                  {
                    content: mergedText,
                    whatsAppApproved,
                  },
                ],
              };
              templates[category] = entry;
            } else {
              templates[category]["templates"].push({
                content: mergedText,
                whatsAppApproved,
              });
            }
          });

          // To fetch the next page of records, call `fetchNextPage`.
          // If there are more records, `page` will get called again.
          // If there are no more records, `done` will get called.
          try {
            console.log("fetching next page...");
            fetchNextPage();
          } catch (err) {
            console.log("err", err);
            throw new Error(err);
          }
        },
        function done(err) {
          if (err) {
            reject(err);
          }
          let response = [];
          for (const template in templates) {
            console.log(templates[template]);
            response.push(templates[template]);
          }
          resolve(response);
        }
      );
  });
};

module.exports = {
  getTemplates,
};
