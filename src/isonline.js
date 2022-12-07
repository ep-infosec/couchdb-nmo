import * as utils from './utils.js';
import log from 'npmlog';
import Wreck from 'wreck';
import Promise from 'bluebird';
import nmo from './nmo.js';
import { getClusterUrls, isNodeOnline } from './utils';


export const cli = isOnlineCli;
function isOnlineCli (...urls) {
  return new Promise((resolve, reject) => {

    if (!urls.length) {
      const err = new Error('Usage: nmo isonline <url>, [<url>] ...');
      err.type = 'EUSAGE';
      return reject(err);
    }

    if (urls.length === 1 && !utils.isUri(urls[0])) {
      urls = getClusterUrls(urls[0]);
    }

    isonline.apply(isonline, urls)
      .then((results) => {
        const jsonOut = nmo.config.get('json');

        if (jsonOut) {
          console.log(results);
          return resolve(results);
        }

        Object.keys(results).forEach((entry) => {
          let msg = 'seems to be offline';
          if (results[entry]) {
            msg = 'seems to be online';
          }

          console.log(entry, msg);
          resolve(results);
        });
      }, reject);
  });
}

export default isonline;
function isonline (...args) {
  return new Promise((resolve, reject) => {

    const urlPromises = args.map((url) => {
      return isNodeOnline(url);
    });

    Promise.all(urlPromises).then((results) => {
      results = results.reduce((acc, el) => {
        const key = Object.keys(el)[0];
        acc[key] = el[key];
        return acc;
      }, {});

      resolve(results);
    }, reject);
  });
}
