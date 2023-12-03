# Generic Housing Scraper
Most websites are paginated and it is less efficient to click the pages one by one. We are also restricted to the available filters and sorts. This script will iteratively go to multiple pages and pull all the data into a CSV or DB so that we could easily process the data.
Different websites have different attributes to be retrieved, therefore the attributes should be config-based so that the script can be a generic for different sites.
Example use case would be scraping all the data like price, locations, floor size, tenure etc. into a CSV and do filtering to shortlist houses that may be a good deal.

## Extra Features
- In case hitting any bot prevention or captchas, human can intervent so that the process can continue.
- Autoscrolling on page load to handle lazy loading sites

## Concept
In a common list page, there are 100s to 1000s of items, they will be paginated so that one page will have 10-20 items. 
Moreover, each item have multiple attributes like name, price, specifications etc.

To scrape these data, we first need a base selector that can get the array of items in a page, and then multiple secondary selectors to get the different attributes of the item.

## Run
```bash
> npm ci
> node index.js ./config.csv
```
## Output
You can check the sample_output.csv to see how an output would look like.