/**
 * Cloudberry Research Radar — Netlify Function
 * Manages sources.json and keywords.json via GitHub API,
 * and can trigger the scrape workflow.
 *
 * Required environment variables:
 *   GITHUB_TOKEN   — Personal access token with 'repo' scope
 *   GITHUB_REPO    — Format: "owner/repo" (e.g. "cloudberry-vc/research-radar")
 *   GITHUB_BRANCH  — Branch name (default: "main")
 */

const GITHUB_API = 'https://api.github.com';

exports.handler = async (event) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Content-Type': 'application/json',
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  const token = process.env.GITHUB_TOKEN;
  const repo = process.env.GITHUB_REPO;
  const branch = process.env.GITHUB_BRANCH || 'main';

  if (!token || !repo) {
    return {
      statusCode: 500, headers,
      body: JSON.stringify({ error: 'Server not configured. Set GITHUB_TOKEN and GITHUB_REPO env vars.' }),
    };
  }

  const ghHeaders = {
    Authorization: `Bearer ${token}`,
    Accept: 'application/vnd.github.v3+json',
    'Content-Type': 'application/json',
  };

  try {
    const body = JSON.parse(event.body);
    const { action } = body;

    // ── Trigger scrape workflow ──
    if (action === 'trigger_scrape') {
      const triggerRes = await fetch(
        `${GITHUB_API}/repos/${repo}/actions/workflows/scrape.yml/dispatches`,
        {
          method: 'POST',
          headers: ghHeaders,
          body: JSON.stringify({ ref: branch }),
        }
      );
      if (!triggerRes.ok) {
        const errText = await triggerRes.text();
        throw new Error(`Workflow trigger failed: ${triggerRes.status} ${errText}`);
      }
      return {
        statusCode: 200, headers,
        body: JSON.stringify({ success: true, message: 'Scrape workflow triggered.' }),
      };
    }

    // ── Update keywords ──
    if (action === 'update_keywords' && body.keywords) {
      const filePath = 'keywords.json';
      const getRes = await fetch(`${GITHUB_API}/repos/${repo}/contents/${filePath}?ref=${branch}`, {
        headers: ghHeaders,
      });
      if (!getRes.ok) throw new Error(`GitHub API error: ${getRes.status}`);
      const fileData = await getRes.json();

      const newContent = Buffer.from(JSON.stringify(body.keywords, null, 2)).toString('base64');
      const updateRes = await fetch(`${GITHUB_API}/repos/${repo}/contents/${filePath}`, {
        method: 'PUT',
        headers: ghHeaders,
        body: JSON.stringify({
          message: 'Update thesis keywords via Radar UI',
          content: newContent,
          sha: fileData.sha,
          branch,
        }),
      });
      if (!updateRes.ok) {
        const errBody = await updateRes.text();
        throw new Error(`GitHub update failed: ${updateRes.status} ${errBody}`);
      }
      return {
        statusCode: 200, headers,
        body: JSON.stringify({ success: true }),
      };
    }

    // ── Source management (add / bulk_add / remove) ──
    const filePath = 'sources.json';
    const getRes = await fetch(`${GITHUB_API}/repos/${repo}/contents/${filePath}?ref=${branch}`, {
      headers: ghHeaders,
    });
    if (!getRes.ok) throw new Error(`GitHub API error: ${getRes.status}`);

    const fileData = await getRes.json();
    const currentContent = Buffer.from(fileData.content, 'base64').toString('utf-8');
    let sources = JSON.parse(currentContent);

    const { source, sources: bulkSources, index } = body;

    if (action === 'add' && source) {
      if (sources.some(s => s.url === source.url)) {
        return {
          statusCode: 400, headers,
          body: JSON.stringify({ error: 'Source with this URL already exists.', sources }),
        };
      }
      sources.push(source);
    } else if (action === 'bulk_add' && Array.isArray(bulkSources)) {
      const existingUrls = new Set(sources.map(s => s.url));
      const unique = bulkSources.filter(s => s.name && s.url && !existingUrls.has(s.url));
      sources.push(...unique);
    } else if (action === 'replace_all' && Array.isArray(body.sources)) {
      sources = body.sources;
    } else if (action === 'remove' && typeof index === 'number') {
      if (index >= 0 && index < sources.length) {
        sources.splice(index, 1);
      }
    } else {
      return {
        statusCode: 400, headers,
        body: JSON.stringify({ error: 'Invalid action.' }),
      };
    }

    const newContent = Buffer.from(JSON.stringify(sources, null, 2)).toString('base64');
    const updateRes = await fetch(`${GITHUB_API}/repos/${repo}/contents/${filePath}`, {
      method: 'PUT',
      headers: ghHeaders,
      body: JSON.stringify({
        message: action === 'bulk_add'
          ? `Bulk add ${(bulkSources || []).length} sources`
          : `${action === 'add' ? 'Add' : 'Remove'} source: ${source?.name || 'source #' + index}`,
        content: newContent,
        sha: fileData.sha,
        branch,
      }),
    });

    if (!updateRes.ok) {
      const errBody = await updateRes.text();
      throw new Error(`GitHub update failed: ${updateRes.status} ${errBody}`);
    }

    return {
      statusCode: 200, headers,
      body: JSON.stringify({ success: true, sources }),
    };

  } catch (err) {
    return {
      statusCode: 500, headers,
      body: JSON.stringify({ error: err.message }),
    };
  }
};
