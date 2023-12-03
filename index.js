// const puppeteer = require('puppeteer');
const puppeteer = require('puppeteer-extra');
const fs = require('fs');
const Papa = require('papaparse');
const StealthPlugin = require('puppeteer-extra-plugin-stealth')
const { Pool } = require('pg');
const readline = require('readline');

const config = {}

const run = async () => {
    await parseConfig()
    const scrapedData = await scrape()
    saveResults(scrapedData, false)
}

const scrape = async () => {
    const scrapedData = []
    const baseUrl = config['baseUrl']
    puppeteer.use(StealthPlugin())
    const browser = await puppeteer.launch({
        headless: false
    });
    const page = await browser.newPage();

    for (let i = config.range.from; i <= config.range.to; i++) {
        const url = baseUrl.replace('{iii}', i)
        const scrapedFromPage = await scrapeSingle(page, url, config['baseSelector'], config['secondarySelectors'])
        scrapedData.push(...scrapedFromPage)
        await sleep(1000)
    }

    page.close()
    await browser.close();
    return scrapedData;
}

const scrapeSingle = async (page, url, baseSelector, secondarySelectors) => {
    await page.goto(url, { waitUntil: 'networkidle2' });
    console.log('scraping ', url);
    
    // scroll page to handle lazy loadings
    await autoScroll(page)
    
    const scrapedData = []

    // handle base selector or wait human intervention for captcha
    let houseItems = null
    while (!houseItems?.length) {
      houseItems = await page.$$(baseSelector);
      if (!houseItems?.length) {
        await waitForUserInput();
      }
    }

    // handle the secondary selectors
    for (const houseItem of houseItems) {
        const scrapedObj = {}
        for(let selector of secondarySelectors) {
            try {
                if (selector.scrapeMethod && selector.scrapeMethod.startsWith('.')) {
                    const nested = selector.scrapeMethod.split('.').slice(1)
                    scrapedObj[selector.scrapeName] = await houseItem.evaluate((element, keys) => {
                        const getNestedValue = (obj, keysArr) => {
                            return keysArr.reduce((o, k) => (o || {})[k], obj);
                        };
                        return getNestedValue(element, keys);
                    }, nested);
                    continue
                }
                if (selector.scrapeAttribute) {
                    const elements = await houseItem.$$(selector.scrapeSelector);
                    const elementsText = await Promise.all(elements.map(element => element.evaluate((node, scrapeMethod) => node[scrapeMethod], selector.scrapeMethod)));
                    const wordsToFind = selector.scrapeAttribute.split(',')
                    const matchedWord =  elementsText.find(testWord => wordsToFind.some(matchWord => testWord.includes(matchWord)));
                    scrapedObj[selector.scrapeName] = matchedWord?.trim();
                    continue
                }
                if (!selector.scrapeSelector) {
                    scrapedObj[selector.scrapeName] = await houseItem.evaluate((node, scrapeMethod) => node[scrapeMethod]?.trim(), selector.scrapeMethod);
                    continue
                }
                scrapedObj[selector.scrapeName] = await houseItem.$eval(selector.scrapeSelector, (node, scrapeMethod) => node[scrapeMethod]?.trim(), selector.scrapeMethod);
            } catch (err) {
                console.error('error on ', selector)
                console.log(err)
                continue
            }
        }
        scrapedData.push(scrapedObj)
    }
    return scrapedData
}

const parseConfig = async () => {
  const configFile = process.argv[2];
  if (!configFile) {
      console.error('Please provide the config file path as an argument.');
      process.exit(1);
  }
  const configCsv = fs.readFileSync(configFile, 'utf8');

  // Parse CSV config
  const configData = Papa.parse(configCsv, {
      header: true,
      dynamicTyping: true,
  }).data;

  config['secondarySelectors'] = []
  for (let c of configData) {
      if (c.type === 'selector') {
          config['secondarySelectors'].push({
              scrapeName: c.name,
              scrapeMethod: c.scrapeMethod,
              scrapeSelector: c.value,
              scrapeAttribute: c.scrapeAttribute,
          })
          continue
      }
      if (c.type === 'range') {
          const rangeArr = c.value.split('||')
          config['range'] = {
              from: rangeArr[0],
              to: rangeArr[1]
          }
          continue
      }
      config[c.type] = c.value;
  }
  console.log(config);
  console.log();
}

/* utils */

// Function to wait for human interventions
const waitForUserInput = () => {
  return new Promise((resolve) => {
      const rl = readline.createInterface({
          input: process.stdin,
          output: process.stdout
      });

      console.log('Items not found, it may be due to CAPCTHA or unexpected reason, please resolve and click enter');
      rl.on('line', () => {
          rl.close();
          resolve();
      });
  });
};

const saveResults = async (rows, isSaveToDb)  => {
    if (isSaveToDb) {
        await saveToDb(rows)
        return
    }
    generateOutputCsv(rows)
}

const generateOutputCsv = (rows) => {
    const csvResults = Papa.unparse(rows);
    fs.writeFileSync('output.csv', csvResults);
}

const saveToDb = async (rows) => {
    const pool = new Pool({
        user: 'postgres',
        host: '0.0.0.0',
        database: 'ethos',
        password: 'development',
        port: 5433,
    })

    const columnNames = config.secondarySelectors.map(s => s.scrapeName)
    const valuesTemplate = columnNames.map((_, i) => `$${i + 1}`).join(', ');
    const columnsTemplate = columnNames.join(', '); 
    const query = `INSERT INTO scraped_data(${columnsTemplate}) VALUES (${valuesTemplate})`;
    try {
        for (const row of rows) {
            await pool.query(query, columnNames.map(colName => row[colName]))
        }
    } catch (err) {
        console.error('Failed to create in DB')
        console.error(err)
    }
}

const autoScroll = async page => {
    await page.evaluate(async () => {
        await new Promise((resolve, reject) => {
            let totalHeight = 0;
            let distance = 300;
            let timer = setInterval(() => {
                let scrollHeight = document.body.scrollHeight;
                window.scrollBy(0, distance);
                totalHeight += distance;

                if(totalHeight >= scrollHeight){
                    clearInterval(timer);
                    resolve();
                }
            }, 100);
        });
    });
}

const sleep = ms => new Promise(r => setTimeout(r, ms));

(async () => await run())()
