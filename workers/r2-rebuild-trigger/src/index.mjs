/**
 * Trigger a Cloudflare Pages deployment once for an entire Queue batch.
 * Throwing keeps the batch unacknowledged so Cloudflare Queues can retry it.
 */
export async function triggerDeploy(deployHook, fetchImpl = fetch) {
  if (!deployHook) {
    throw new Error('CF_DEPLOY_HOOK is not configured');
  }

  const response = await fetchImpl(deployHook, {
    method: 'POST',
    headers: {
      'user-agent': 'gaivrt-r2-rebuild-trigger',
    },
  });

  if (!response.ok) {
    throw new Error(`Cloudflare Pages deploy hook returned ${response.status}`);
  }
}

export default {
  async queue(_batch, env) {
    await triggerDeploy(env.CF_DEPLOY_HOOK);
  },
};
