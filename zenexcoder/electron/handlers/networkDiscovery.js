import { ipcMain } from 'electron';
import { Bonjour } from 'bonjour-service';
import { CLUSTER_SERVICE_TYPE, getClusterIdentity, notify } from './clusterCore.js';
import { getWebSocketServerPort } from './websocketServer.js';
import { clusterState, registerDiscoveredNode } from './websocketClient.js';

let bonjour = null;
let browser = null;
let publishedService = null;
let scanning = false;

async function ensureBonjour() {
  if (!bonjour) {
    bonjour = new Bonjour();
  }
  return bonjour;
}

export async function startNetworkDiscovery() {
  const instance = await ensureBonjour();
  const identity = await getClusterIdentity();
  const port = getWebSocketServerPort();

  if (!publishedService) {
    publishedService = instance.publish({
      name: `ZenexCoder-Node-${identity.hostname}-${identity.nodeId.slice(0, 8)}`,
      type: CLUSTER_SERVICE_TYPE,
      port,
      txt: {
        nodeId: identity.nodeId,
        hostname: identity.hostname,
        platform: identity.platform,
        arch: identity.arch
      }
    });
  }

  if (!browser) {
    browser = instance.find({ type: CLUSTER_SERVICE_TYPE });
    browser.on('up', (service) => registerDiscoveredNode(service));
    browser.on('down', (service) => {
      const node = registerDiscoveredNode({ ...service, status: 'offline' });
      if (node) {
        node.status = 'offline';
      }
    });
  }
  scanning = true;
  return { ok: true, scanning, state: clusterState() };
}

export async function stopNetworkDiscovery() {
  scanning = false;
  try {
    browser?.stop();
  } catch {}
  try {
    publishedService?.stop();
  } catch {}
  try {
    bonjour?.destroy();
  } catch {}
  browser = null;
  publishedService = null;
  bonjour = null;
  return { ok: true };
}

export function registerNetworkDiscoveryHandlers() {
  ipcMain.handle('cluster:scan-start', async () => {
    try {
      return await startNetworkDiscovery();
    } catch (error) {
      notify('Cluster discovery failed', error.message, 'warning');
      return { ok: false, message: error.message, state: clusterState() };
    }
  });
}
