import * as utils from './utils.js';
import log from 'npmlog';
import Wreck from 'wreck';
import Promise from 'bluebird';
import prettyjson from 'prettyjson';
import nmo from './nmo.js';
import isonline from './isonline.js';
import { getClusterUrls } from './utils.js';

export function cli (cmd, cluster, section, key, value) {
  return new Promise((resolve, reject) => {

    if (!cmd || !cluster || !exports[cmd]) {
      const msg = [
        'Usage:',
        '',
        'nmo couch-config get <cluster> [<section>] [--json]',
        'nmo config-config set <cluster> <section>, <key>, <value>'
      ].join('\n');

      const err = new Error(msg);
      err.type = 'EUSAGE';
      return reject(err);
    }

    exports[cmd].apply(exports[cmd], [cluster, getClusterNodes(cluster), section, key, value])
      .then(resolve)
      .catch(reject);
  });
}

export function getClusterNodes (clusterName) {
  const nodes = nmo.config.get(clusterName);
  if (!nodes) {
    const err = new Error('Cluster does not exist');
    err.type = 'EUSAGE';
    throw err;
  }

  return nodes;
}

export function get (cluster, nodes, section) {
  const promise = Promise.reduce(Object.keys(nodes), (obj, node) => {
    const url = buildConfigUrl(node, nodes[node], section);
    return getConfig(node, url).then(({node, config}) => {
      obj[node] = config;
      return obj;
    });
  }, {});

  promise.then((nodeConfigs) => {
    const jsonOut = nmo.config.get('json');

    if (jsonOut) {
      console.log(nodeConfigs);
      return nodeConfigs;
    }

    Object.keys(nodeConfigs).forEach(node => {
      var msg = [
        'NODE ' + node + ':',
        prettyjson.render(nodeConfigs[node], {})
      ].join('\n');
      console.log(msg);
    });
  });

  return promise;
}

export function set(cluster, nodes, section, key, value) {
  const urls = getClusterUrls(cluster);
  return isonline.apply(isonline, urls).then(results => {
    const offline = Object.keys(results).filter(node => {
      if (!results[node]) {
        return true;
      }

      return false;
    });

    if (offline.length > 0) {
      const msg = offline.map(node => 'Node ' + offline + ' is offline.').join('');
      const err = new Error(msg);
      err.type = 'EUSAGE';
      throw err;
    }

    const promises = Object.keys(nodes).map(node => {
      return setConfig(node, buildConfigUrl(node, nodes[node], section, key), value);
    });

    const allPromise = Promise.all(promises);
    allPromise
      .then((resp) => {
        console.log(prettyjson.render(resp));
      })
      .catch((err) => {
        throw err;
      });

    return allPromise;
  });
}

export function setConfig (node, url, value) {
  return new Promise((resolve, reject) => {
    let er = utils.validUrl(url);

    if (er) {
      er.type = 'EUSAGE';
      return reject(er);
    }
    const cleanedUrl = utils.removeUsernamePw(url);
    log.http('request', 'PUT', cleanedUrl);

    Wreck.put(url, {payload: JSON.stringify(value)}, (err, res, payload) => {
      if (err) {
        const error = new Error('Error on set config for node ' + node + ' ' + err);
        error.type = 'EUSAGE';
        return reject(error);
      }

      log.http(res.statusCode, cleanedUrl);
      resolve({
        node: node,
        oldvalue: JSON.parse(payload),
        newvalue: value
      });
    });
  });
}

export function buildConfigUrl (node, url, section, key) {
  let configUrl = url + '/_node/' + node + '/_config';

  if (section) {
    configUrl += '/' + section;
  }

  if (key) {
    configUrl += '/' + key;
  }

  return configUrl;
}

export function getConfig (node, url) {
  return new Promise((resolve, reject) => {
    let er = utils.validUrl(url);

    if (er) {
      er.type = 'EUSAGE';
      return reject(er);
    }
    const cleanedUrl = utils.removeUsernamePw(url);
    log.http('request', 'GET', cleanedUrl);

    Wreck.get(url, (err, res, payload) => {
      if (err) {
        if (err.code === 'ECONNREFUSED' || err.code === 'ENOTFOUND') {
          const noNodeErr = new Error('Could not find node ' + node +
            ' this could mean the node is down.');
          noNodeErr.type = 'EUSAGE';
          return reject(noNodeErr);
        }

        err.type = 'EUSAGE';
        return reject(err);
      }

      log.http(res.statusCode, cleanedUrl);
      resolve({node: node, config: JSON.parse(payload)});
    });
  });
}
