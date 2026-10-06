// Azure DevOps Intelligence Hub - Repositories & Policies Module
window.RepoModule = {
  branches: [],
  branchIndex: 0,
  prs: [],
  prIndex: 0,
  policies: [],
  pageSize: 25,
  currentProject: '',
  currentOrg: '',

  formatPolicyDetails(p) {
    const typeName = (p.type?.displayName || '').toLowerCase();
    const settings = p.settings || {};

    if (typeName.includes('reviewer') || typeName.includes('minimum number')) {
      const count = settings.minimumApproverCount || 1;
      const creatorVote = settings.creatorVoteCounts === false ? ' (Creator vote prohibited)' : '';
      const resetOnPush = settings.resetOnSourcePush ? ' (Reset on push)' : '';
      return `Min Reviewers: ${count}${creatorVote}${resetOnPush}`;
    }
    if (typeName.includes('build')) {
      const buildDefName = settings.displayName || settings.buildDefinitionId || 'CI Validation Pipeline';
      const manual = settings.manualQueueOnly ? 'Manual run' : 'Automatic trigger';
      return `Build Validation: "${buildDefName}" (${manual})`;
    }
    if (typeName.includes('work item')) {
      return settings.state === 'required' || p.isBlocking ? 'Required linked work item' : 'Optional linked work item';
    }
    if (typeName.includes('comment')) {
      return 'All pull request comments must be resolved';
    }
    if (typeName.includes('status')) {
      return `Status check: ${settings.name || 'External CI service'}`;
    }
    if (typeName.includes('merge strategy') || typeName.includes('pattern')) {
      return `Enforce merge commit / squash pattern`;
    }
    return p.type?.displayName || 'Branch Protection Policy';
  },

  // Strict Policy Matching Function
  getMatchingPoliciesForBranch(repoId, branchName, allPolicyConfigs) {
    const fullRef = `refs/heads/${branchName}`.toLowerCase();
    const cleanBranch = branchName.toLowerCase();

    return allPolicyConfigs.filter(p => {
      if (!p.isEnabled) return false;
      const scopes = p.settings?.scope || [];

      return scopes.some(sc => {
        if (sc.repositoryId && sc.repositoryId.toLowerCase() !== repoId.toLowerCase()) {
          return false;
        }

        const scopeRef = (sc.refName || '').toLowerCase();
        const cleanScopeRef = scopeRef.replace(/^refs\/heads\//, '');
        const matchKind = (sc.matchKind || 'Exact').toLowerCase();

        if (matchKind === 'exact') {
          return scopeRef === fullRef || cleanScopeRef === cleanBranch;
        } else if (matchKind === 'prefix') {
          return fullRef.startsWith(scopeRef) || cleanBranch.startsWith(cleanScopeRef);
        } else if (matchKind === 'defaultbranch') {
          return false;
        }
        return scopeRef === fullRef || cleanScopeRef === cleanBranch;
      });
    });
  },

  async inspect(org, project, pat, targetRepoInput, cachedRepos, targetView = null) {
    this.currentOrg = org;
    this.currentProject = project;
    let targetRepos = cachedRepos;
    if (targetRepoInput !== '-- All Repositories --' && targetRepoInput) {
      targetRepos = cachedRepos.filter(r => r.name.toLowerCase().includes(targetRepoInput.toLowerCase()));
    }
    if (!targetRepos.length) throw new Error(`No repository matching "${targetRepoInput}"`);

    const auth = 'Basic ' + btoa(':' + pat);
    let counts = {};
    const now = new Date();
    let allPolicyConfigs = [];

    // 1. Fetch Project-Level Policy Configurations
    try {
      const policyUrl = `${encodeURIComponent(project)}/_apis/policy/configurations?api-version=6.0&$top=500`;
      const policyData = await window.HubApp.fetchAdo(org, policyUrl, auth);
      allPolicyConfigs = policyData.value || [];
    } catch (e) {
      console.warn('Policy configurations query notice:', e);
    }

    const targetRepoIds = new Set(targetRepos.map(r => r.id.toLowerCase()));
    const detailedPolicyRows = [];

    allPolicyConfigs.forEach(p => {
      if (!p.isEnabled) return;
      const scopes = p.settings?.scope || [];
      const policyType = p.type?.displayName || 'Branch Policy';
      const enforcement = p.isBlocking ? 'Blocking (Required)' : 'Optional';
      const details = this.formatPolicyDetails(p);

      scopes.forEach(sc => {
        if (sc.repositoryId && !targetRepoIds.has(sc.repositoryId.toLowerCase())) {
          return;
        }

        const matchingRepo = targetRepos.find(r => r.id.toLowerCase() === (sc.repositoryId || '').toLowerCase());
        const repoDisplayName = matchingRepo ? matchingRepo.name : (sc.repositoryId ? 'Specific Repo' : 'Project Default (All Repos)');
        const refName = (sc.refName || '').replace(/^refs\/heads\//, '');

        detailedPolicyRows.push({
          repo: repoDisplayName,
          branch: refName || 'All Branches',
          policyType: policyType,
          enforcement: enforcement,
          details: details,
          isBlocking: p.isBlocking,
          rawPolicy: p
        });
      });
    });

    this.policies = detailedPolicyRows;

    // 2. Fetch Branches & PRs Across Target Repositories
    const repoTasks = targetRepos.map(async (r) => {
      try {
        const res = await window.HubApp.fetchAdo(org, `${encodeURIComponent(project)}/_apis/git/repositories/${r.id}/refs?filter=heads/&api-version=6.0`, auth);
        const refs = res.value || [];
        counts[r.name] = refs.length;

        return await Promise.all(refs.map(async (ref) => {
          const bName = ref.name.replace(/^refs\/heads\//, '');
          const cRes = await window.HubApp.fetchAdo(org, `${encodeURIComponent(project)}/_apis/git/repositories/${r.id}/commits?searchCriteria.itemVersion.version=${encodeURIComponent(bName)}&$top=1&api-version=6.0`, auth);
          const topC = cRes.value?.[0];
          const d = topC?.author?.date ? new Date(topC.author.date) : null;

          const branchPolicies = this.getMatchingPoliciesForBranch(r.id, bName, allPolicyConfigs);

          return {
            repo: r.name,
            repoId: r.id,
            branch: bName,
            policies: branchPolicies,
            hasPolicy: branchPolicies.length > 0,
            policySummary: branchPolicies.length ? branchPolicies.map(bp => bp.type?.displayName || 'Protected').join(', ') : 'No Policy',
            author: topC?.author?.name || 'Unknown',
            authorEmail: topC?.author?.email || '',
            date: d ? d.toLocaleDateString() : 'N/A',
            rawDate: d,
            isStale: d ? ((now - d) / (1000 * 60 * 60 * 24)) > 90 : false,
            msg: topC?.comment || '',
            commitId: topC?.commitId || 'HEAD',
            url: r.webUrl ? `${r.webUrl}?version=GB${encodeURIComponent(bName)}` : `https://dev.azure.com/${org}/${encodeURIComponent(project)}/_git/${encodeURIComponent(r.name)}?version=GB${encodeURIComponent(bName)}`,
            rawRef: ref
          };
        }));
      } catch (e) { return []; }
    });

    // Fetch PRs
    const prTasks = targetRepos.map(async (r) => {
      try {
        const prRes = await window.HubApp.fetchAdo(org, `${encodeURIComponent(project)}/_apis/git/repositories/${r.id}/pullrequests?searchCriteria.status=all&$top=100&api-version=6.0`, auth);
        return (prRes.value || []).map(pr => ({
          repo: r.name,
          prId: pr.pullRequestId,
          title: `#${pr.pullRequestId}: ${pr.title}`,
          rawTitle: pr.title,
          source: pr.sourceRefName?.replace('refs/heads/', ''),
          target: pr.targetRefName?.replace('refs/heads/', ''),
          creator: pr.createdBy?.displayName || '-',
          creatorEmail: pr.createdBy?.uniqueName || '',
          status: pr.status,
          createdDate: new Date(pr.creationDate).toLocaleDateString(),
          url: pr.url ? pr.url.replace('/_apis/git/repositories/', '/_git/').replace('/pullRequests/', '/pullrequest/') : `https://dev.azure.com/${org}/${encodeURIComponent(project)}/_git/${encodeURIComponent(r.name)}/pullrequest/${pr.pullRequestId}`,
          rawPr: pr
        }));
      } catch (e) { return []; }
    });

    const [bResults, pResults] = await Promise.all([Promise.all(repoTasks), Promise.all(prTasks)]);
    this.branches = bResults.flat();
    this.branchIndex = 0;
    this.prs = pResults.flat();
    this.prIndex = 0;

    // Sort: Protected branches first, then alphabetical
    this.branches.sort((a, b) => (b.hasPolicy ? 1 : 0) - (a.hasPolicy ? 1 : 0) || a.branch.localeCompare(b.branch));
    const totalProtectedBranches = this.branches.filter(b => b.hasPolicy).length;
    const staleBranchesCount = this.branches.filter(b => b.isStale).length;
    const activePrsCount = this.prs.filter(p => p.status === 'active').length;
    const completedPrsCount = this.prs.filter(p => p.status === 'completed').length;
    const repoLabel = targetRepos.length === 1 ? targetRepos[0].name : (targetRepoInput && targetRepoInput !== '-- All Repositories --' ? targetRepoInput : `${project} (${targetRepos.length} Repos)`);

    this.currentRepoLabel = repoLabel;
    this.staleBranchesCount = staleBranchesCount;
    this.activePrsCount = activePrsCount;
    this.completedPrsCount = completedPrsCount;

    window.HubApp.setRepoKpis(
      repoLabel,
      this.branches.length,
      staleBranchesCount,
      this.prs.length,
      activePrsCount,
      completedPrsCount
    );

    if (!targetView || targetView === 'repositories') {
      this.renderBranches(false);
    }
    if (!targetView || targetView === 'policies') {
      this.renderPolicies();
    }
    if (!targetView || targetView === 'prs') {
      this.renderPrs(false);
    }

    window.HubApp.renderChart(Object.keys(counts), Object.values(counts), 'Active Branches per Repository');
  },

  updateKpis() {
    if (!this.branches || this.branches.length === 0) return;
    const staleBranchesCount = this.staleBranchesCount !== undefined ? this.staleBranchesCount : this.branches.filter(b => b.isStale).length;
    const activePrsCount = this.activePrsCount !== undefined ? this.activePrsCount : (this.prs || []).filter(p => p.status === 'active').length;
    const completedPrsCount = this.completedPrsCount !== undefined ? this.completedPrsCount : (this.prs || []).filter(p => p.status === 'completed').length;
    const repoLabel = this.currentRepoLabel || (document.getElementById('repoSelect')?.value) || 'Repositories';

    window.HubApp.setRepoKpis(
      repoLabel,
      this.branches.length,
      staleBranchesCount,
      (this.prs || []).length,
      activePrsCount,
      completedPrsCount
    );
  },

  renderBranches(append = false) {
    const tbody = document.getElementById('branchesTableBody');
    if (!tbody) return;
    if (!append) tbody.innerHTML = '';

    const slice = this.branches.slice(this.branchIndex, this.branchIndex + this.pageSize);

    slice.forEach((b, localIdx) => {
      const globalIdx = this.branchIndex + localIdx;
      
      const healthBadge = b.isStale
        ? `<span class="badge badge-stale"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 14 14"></polyline></svg>Stale (>90d)</span>`
        : `<span class="badge badge-succeeded"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"></polyline></svg>Active</span>`;

      const policyBadge = b.hasPolicy
        ? `<span class="badge badge-succeeded" title="${b.policySummary}"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"></path></svg>${b.policies.length} Policy Rules</span>`
        : `<span class="badge badge-canceled"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="5" y1="12" x2="19" y2="12"></line></svg>No Policy</span>`;

      const tr = document.createElement('tr');
      tr.title = 'Click to inspect Branch Policies & Telemetry Blade';
      tr.innerHTML = `
        <td><strong>${b.repo}</strong></td>
        <td><code>${b.branch}</code></td>
        <td>${healthBadge}</td>
        <td>${policyBadge}</td>
        <td>${b.author}</td>
        <td>${b.date}</td>
        <td style="max-width:240px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${b.msg || '-'}</td>
      `;
      tr.addEventListener('click', () => this.openBranchBlade(globalIdx));
      tbody.appendChild(tr);
    });

    this.branchIndex += slice.length;

    const rem = this.branches.length - this.branchIndex;
    const btnContainer = document.getElementById('seeMoreRepoContainer');
    if (btnContainer) {
      btnContainer.classList.toggle('hidden', rem <= 0);
      document.getElementById('repoRemainingCount').textContent = rem;
    }
  },

  renderPolicies() {
    const tbody = document.getElementById('policyTableBody');
    if (!tbody) return;

    if (this.policies.length === 0) {
      tbody.innerHTML = `<tr><td colspan="6" class="p-4 text-center text-slate-400">No branch policies configured for this repository.</td></tr>`;
      return;
    }

    tbody.innerHTML = this.policies.map(p => {
      const enforcementBadge = p.isBlocking
        ? `<span class="badge badge-failed"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="10"></circle><line x1="4.93" y1="4.93" x2="19.07" y2="19.07"></line></svg>Blocking (Required)</span>`
        : `<span class="badge badge-inprogress"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"></polyline></svg>Optional</span>`;

      return `
        <tr>
          <td><strong>${p.repo}</strong></td>
          <td><code>${p.branch}</code></td>
          <td><strong>${p.policyType}</strong></td>
          <td>${enforcementBadge}</td>
          <td>${p.details}</td>
          <td><span class="badge badge-succeeded"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"></polyline></svg>Active & Enabled</span></td>
        </tr>
      `;
    }).join('');
  },

  renderPrs(append = false) {
    const tbody = document.getElementById('repoPrsTableBody');
    if (!tbody) return;
    if (!append) tbody.innerHTML = '';

    const slice = this.prs.slice(this.prIndex, this.prIndex + this.pageSize);

    slice.forEach((p, localIdx) => {
      const globalIdx = this.prIndex + localIdx;
      let statusBadge = `<span class="badge badge-inprogress">${p.status}</span>`;
      if (p.status === 'completed') statusBadge = `<span class="badge badge-succeeded"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"></polyline></svg>Completed</span>`;
      if (p.status === 'abandoned') statusBadge = `<span class="badge badge-canceled">Abandoned</span>`;

      const tr = document.createElement('tr');
      tr.title = 'Click to inspect Pull Request Blade';
      tr.innerHTML = `
        <td><strong>${p.repo}</strong></td>
        <td><strong>${p.title}</strong></td>
        <td><code>${p.source} ➔ ${p.target}</code></td>
        <td>${p.creator}</td>
        <td>${statusBadge}</td>
        <td>${p.createdDate}</td>
      `;
      tr.addEventListener('click', () => this.openPrBlade(globalIdx));
      tbody.appendChild(tr);
    });

    this.prIndex += slice.length;

    const rem = this.prs.length - this.prIndex;
    const btnContainer = document.getElementById('seeMoreRepoPrsContainer');
    if (btnContainer) {
      btnContainer.classList.toggle('hidden', rem <= 0);
      document.getElementById('repoPrsRemainingCount').textContent = rem;
    }
  },

  openBranchBlade(branchIdx) {
    const b = this.branches[branchIdx];
    if (!b) return;

    window.BladeController.openBlade({
      title: `${b.repo} / ${b.branch}`,
      subtitle: `Git Branch Matrix & Policy Compliance Telemetry`,
      breadcrumbProject: this.currentProject,
      breadcrumbResource: `Repos > ${b.branch}`,
      adoUrl: b.url,
      rawData: b.rawRef,
      iconSvg: `
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <line x1="6" y1="3" x2="6" y2="15"></line>
          <circle cx="18" cy="6" r="3"></circle>
          <circle cx="6" cy="18" r="3"></circle>
          <path d="M18 9a9 9 0 0 1-9 9"></path>
        </svg>
      `,
      renderers: {
        overview: () => `
          <div class="blade-section">
            <div class="blade-section-title">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 14 14"></polyline></svg>
              Branch Health & Metadata
            </div>
            <div class="blade-kv-grid">
              <div class="blade-kv-item">
                <span class="blade-kv-label">REPOSITORY</span>
                <span class="blade-kv-value">${b.repo}</span>
              </div>
              <div class="blade-kv-item">
                <span class="blade-kv-label">BRANCH REF</span>
                <span class="blade-kv-value"><code>refs/heads/${b.branch}</code></span>
              </div>
              <div class="blade-kv-item">
                <span class="blade-kv-label">HEALTH STATUS</span>
                <span class="blade-kv-value">${b.isStale ? '<span class="badge badge-stale">Stale Branch (>90 Days)</span>' : '<span class="badge badge-succeeded">Active Branch</span>'}</span>
              </div>
              <div class="blade-kv-item">
                <span class="blade-kv-label">POLICY ENFORCEMENT</span>
                <span class="blade-kv-value">${b.hasPolicy ? '<span class="badge badge-succeeded">Protected with Policies</span>' : '<span class="badge badge-canceled">No Branch Policy</span>'}</span>
              </div>
              <div class="blade-kv-item">
                <span class="blade-kv-label">LAST COMMIT AUTHOR</span>
                <span class="blade-kv-value">${b.author}</span>
              </div>
              <div class="blade-kv-item">
                <span class="blade-kv-label">LAST COMMIT DATE</span>
                <span class="blade-kv-value">${b.date}</span>
              </div>
              <div class="blade-kv-item" style="grid-column: 1 / -1;">
                <span class="blade-kv-label">LAST COMMIT MESSAGE</span>
                <span class="blade-kv-value" style="font-family:'JetBrains Mono'; font-size:12px; background:#080c14; padding:8px 12px; border-radius:4px; border:1px solid #1b2636;">${b.msg || 'No commit message recorded'}</span>
              </div>
            </div>
          </div>
        `,

        stages: () => `
          <div class="blade-section">
            <div class="blade-section-title">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"></path></svg>
              Enforced Protection Policies (${b.policies.length})
            </div>
            ${b.policies.length ? `
              <table style="font-size:12px;">
                <thead>
                  <tr>
                    <th>POLICY TYPE</th>
                    <th>ENFORCEMENT</th>
                    <th>CONFIGURATION DETAILS</th>
                  </tr>
                </thead>
                <tbody>
                  ${b.policies.map(p => `
                    <tr>
                      <td><strong>${p.type?.displayName || 'Branch Policy'}</strong></td>
                      <td><span class="badge ${p.isBlocking ? 'badge-failed' : 'badge-inprogress'}">${p.isBlocking ? 'Blocking (Required)' : 'Optional'}</span></td>
                      <td>${window.RepoModule.formatPolicyDetails(p)}</td>
                    </tr>
                  `).join('')}
                </tbody>
              </table>
            ` : `
              <p style="font-size:12.5px; color:var(--text-muted);">
                ⚠️ No branch protection policies are currently attached to <code>${b.branch}</code>. Pull requests may be merged directly without required peer reviews.
              </p>
            `}
          </div>
        `
      }
    });
  },

  openPrBlade(prIdx) {
    const p = this.prs[prIdx];
    if (!p) return;

    window.BladeController.openBlade({
      title: p.title,
      subtitle: `Pull Request Verification & Review Status`,
      breadcrumbProject: this.currentProject,
      breadcrumbResource: `Pull Requests > #${p.prId}`,
      adoUrl: p.url,
      rawData: p.rawPr,
      iconSvg: `
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <circle cx="18" cy="18" r="3"></circle>
          <circle cx="6" cy="6" r="3"></circle>
          <path d="M13 6h3a2 2 0 0 1 2 2v7"></path>
          <line x1="6" y1="9" x2="6" y2="21"></line>
        </svg>
      `,
      renderers: {
        overview: () => `
          <div class="blade-section">
            <div class="blade-section-title">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 14 14"></polyline></svg>
              Pull Request Overview
            </div>
            <div class="blade-kv-grid">
              <div class="blade-kv-item">
                <span class="blade-kv-label">REPOSITORY</span>
                <span class="blade-kv-value">${p.repo}</span>
              </div>
              <div class="blade-kv-item">
                <span class="blade-kv-label">STATUS</span>
                <span class="blade-kv-value"><span class="badge ${p.status === 'completed' ? 'badge-succeeded' : 'badge-inprogress'}">${p.status}</span></span>
              </div>
              <div class="blade-kv-item">
                <span class="blade-kv-label">SOURCE BRANCH</span>
                <span class="blade-kv-value"><code>${p.source}</code></span>
              </div>
              <div class="blade-kv-item">
                <span class="blade-kv-label">TARGET MERGE BRANCH</span>
                <span class="blade-kv-value"><code>${p.target}</code></span>
              </div>
              <div class="blade-kv-item">
                <span class="blade-kv-label">AUTHOR / CREATOR</span>
                <span class="blade-kv-value">${p.creator} (${p.creatorEmail})</span>
              </div>
              <div class="blade-kv-item">
                <span class="blade-kv-label">CREATION DATE</span>
                <span class="blade-kv-value">${p.createdDate}</span>
              </div>
            </div>
          </div>
        `
      }
    });
  }
};
