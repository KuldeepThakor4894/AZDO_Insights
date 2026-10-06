// Azure DevOps Intelligence Hub - Comprehensive Project Overview Dashboard
window.DashboardModule = {
  currentProject: '',
  currentOrg: '',
  currentPat: '',
  currentTimeRange: '7d', // '24h' | '7d' | '30d'
  pipelineHealthChart: null,
  workItemDistChart: null,
  eventsBound: false,
  cachedProjects: [],
  lastPipelineHealth: null,
  lastWorkItemDist: null,
  isLoading: false,

  escapeHtml(str) {
    return String(str || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  },

  formatRelativeTime(dateInput) {
    if (!dateInput) return '—';
    const date = new Date(dateInput);
    if (isNaN(date.getTime())) return '—';
    const seconds = Math.floor((new Date() - date) / 1000);
    if (seconds < 60) return 'Just now';
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    if (days < 30) return `${days}d ago`;
    return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  },

  getTimeRangeCutoff() {
    const now = new Date();
    if (this.currentTimeRange === '24h') {
      return new Date(now.getTime() - 24 * 60 * 60 * 1000);
    }
    if (this.currentTimeRange === '30d') {
      return new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    }
    // Default: 7 days
    return new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  },

  getAuthHeader() {
    const pat = (this.currentPat || '').trim();
    if (!pat) return '';
    return pat.startsWith('Basic ') ? pat : 'Basic ' + btoa(':' + pat);
  },

  setLoading(show) {
    this.isLoading = show;
    const overlay = document.getElementById('azDashLoadingOverlay');
    if (overlay) {
      if (show) overlay.classList.remove('hidden');
      else overlay.classList.add('hidden');
    }
  },

  updateLastUpdatedTimestamp() {
    const now = new Date();
    const timeStr = now.toLocaleTimeString(undefined, { hour12: false });
    const textEl = document.getElementById('dashLastUpdatedText');
    if (textEl) {
      textEl.textContent = `Last updated: ${timeStr}`;
    }
  },

  async fetchApi(urlPath, options = {}) {
    const org = this.currentOrg;
    const auth = this.getAuthHeader();
    if (!org || !auth) return null;

    try {
      const fullUrl = urlPath.startsWith('http')
        ? urlPath
        : `https://dev.azure.com/${org}/${urlPath}`;

      const fetchOptions = {
        method: options.method || 'GET',
        headers: {
          'Authorization': auth,
          'Accept': 'application/json',
          ...(options.body ? { 'Content-Type': 'application/json' } : {}),
          ...(options.headers || {})
        },
        ...(options.body ? { body: options.body } : {})
      };

      const res = await fetch(fullUrl, fetchOptions);

      if (!res.ok) {
        return null;
      }

      const contentType = res.headers.get('content-type') || '';
      if (!contentType.includes('json')) {
        return null;
      }

      return await res.json();
    } catch (err) {
      return null;
    }
  },

  reset() {
    this.currentProject = '';
    this.lastPipelineHealth = null;
    this.lastWorkItemDist = null;

    // Destroy active charts
    if (this.pipelineHealthChart) {
      this.pipelineHealthChart.destroy();
      this.pipelineHealthChart = null;
    }
    if (this.workItemDistChart) {
      this.workItemDistChart.destroy();
      this.workItemDistChart = null;
    }

    // Clear chart canvases
    ['azDashPipelineHealthCanvas', 'azDashWorkItemDistCanvas'].forEach(id => {
      const c = document.getElementById(id);
      if (c) {
        const ctx = c.getContext('2d');
        if (ctx) ctx.clearRect(0, 0, c.width, c.height);
      }
    });

    // Reset Critical Alerts Banner
    const alertsBanner = document.getElementById('azDashCriticalAlertsBanner');
    if (alertsBanner) alertsBanner.classList.add('hidden');
    const alertsList = document.getElementById('azDashCriticalAlertsList');
    if (alertsList) alertsList.innerHTML = '';

    // Reset KPI Card 1: Work Items
    const elWiActive = document.getElementById('dashKpiActiveWorkItems');
    if (elWiActive) elWiActive.textContent = '—';
    const elWiScope = document.getElementById('dashKpiTotalScopeBadge');
    if (elWiScope) elWiScope.textContent = '0 items';
    const elWiBugs = document.getElementById('dashKpiBugsCount');
    if (elWiBugs) elWiBugs.textContent = '0';
    const elWiClosed = document.getElementById('dashKpiClosedCount');
    if (elWiClosed) elWiClosed.textContent = '0';
    const elWiProg = document.getElementById('dashKpiWorkItemsProgress');
    if (elWiProg) elWiProg.style.width = '0%';

    // Reset KPI Card 2: Pipelines
    const elPipeRate = document.getElementById('dashKpiPipelinePassRate');
    if (elPipeRate) elPipeRate.textContent = '—';
    const elPipeBadge = document.getElementById('dashKpiPipelineRateBadge');
    if (elPipeBadge) elPipeBadge.textContent = '0% Pass';
    const elPipeTotal = document.getElementById('dashKpiPipelineTotalRuns');
    if (elPipeTotal) elPipeTotal.textContent = '0';
    const elPipePassed = document.getElementById('dashKpiPipelinePassed');
    if (elPipePassed) elPipePassed.textContent = '0';
    const elPipeFailed = document.getElementById('dashKpiPipelineFailed');
    if (elPipeFailed) elPipeFailed.textContent = '0';
    const elPipeRunning = document.getElementById('dashKpiPipelineRunning');
    if (elPipeRunning) elPipeRunning.textContent = '0';
    const elPipeProg = document.getElementById('dashKpiPipelineProgress');
    if (elPipeProg) elPipeProg.style.width = '0%';

    // Reset KPI Card 3: Repos & PRs
    const elPrCount = document.getElementById('dashKpiOpenPrsCount');
    if (elPrCount) elPrCount.textContent = '—';
    const elReposBadge = document.getElementById('dashKpiReposCountBadge');
    if (elReposBadge) elReposBadge.textContent = '0 Repos';
    const elActiveRepos = document.getElementById('dashKpiActiveReposCount');
    if (elActiveRepos) elActiveRepos.textContent = '0';
    const elActiveBranches = document.getElementById('dashKpiActiveBranchesCount');
    if (elActiveBranches) elActiveBranches.textContent = '0';
    const elPrProg = document.getElementById('dashKpiPrProgress');
    if (elPrProg) elPrProg.style.width = '0%';

    // Reset KPI Card 4: Infrastructure
    const elPools = document.getElementById('dashKpiOnlinePoolsCount');
    if (elPools) elPools.textContent = '—';
    const elEndpoints = document.getElementById('dashKpiEndpointsCount');
    if (elEndpoints) elEndpoints.textContent = '0';

    // Reset Visual Chart Legends
    ['azLegendPipePassed', 'azLegendPipeFailed', 'azLegendPipeRunning',
     'azLegendWiNew', 'azLegendWiActive', 'azLegendWiTesting', 'azLegendWiClosed'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.textContent = '0';
    });

    const ratioBadge = document.getElementById('dashPipelineHealthRatio');
    if (ratioBadge) ratioBadge.textContent = '—';

    const wiBadge = document.getElementById('dashWorkItemTotalCountBadge');
    if (wiBadge) wiBadge.textContent = '0 Total';

    // Reset Open PRs Table
    const prContainer = document.getElementById('azDashOpenPrContainer');
    if (prContainer) {
      prContainer.innerHTML = `
        <div class="az-empty-dash-state" style="padding:24px 0;">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
            <circle cx="18" cy="18" r="3"></circle>
            <circle cx="6" cy="6" r="3"></circle>
            <path d="M13 6h3a2 2 0 0 1 2 2v7"></path>
            <line x1="6" y1="9" x2="6" y2="21"></line>
          </svg>
          <div style="font-weight:600; margin-top:6px;">No Open Pull Requests</div>
          <div style="font-size:11px; color:var(--text-muted); margin-top:3px;">Select a project or all pull requests are merged and approved.</div>
        </div>
      `;
    }
    const prBadge = document.getElementById('azDashPrCountBadge');
    if (prBadge) prBadge.textContent = '0';

    // Reset Recent Activity List
    const actContainer = document.getElementById('azDashRecentActivityList');
    if (actContainer) {
      actContainer.innerHTML = `
        <div class="az-empty-dash-state" style="padding:24px 0;">
          <div style="font-size:11px; color:var(--text-muted);">No recent project activity recorded.</div>
        </div>
      `;
    }

    // Reset Header & Show No Project Banner
    const teamNameEl = document.getElementById('azDashTeamName');
    if (teamNameEl) teamNameEl.textContent = 'Select a Project';

    const noProjBanner = document.getElementById('azDashNoProjectBanner');
    if (noProjBanner) noProjBanner.classList.remove('hidden');

    const lastUpd = document.getElementById('dashLastUpdatedText');
    if (lastUpd) lastUpd.textContent = 'Last updated: —';
  },

  async init(org, project, pat) {
    if (!org || !project || !pat) {
      this.reset();
      return;
    }

    this.currentOrg = org;
    this.currentProject = project;
    this.currentPat = pat;

    const cleanProject = project.trim();

    // Read time range selector
    const timeSelect = document.getElementById('dashTimeRangeSelect');
    if (timeSelect) {
      this.currentTimeRange = timeSelect.value || '7d';
    }

    // Update Header Toolbar & Hide No-Project Banner
    const teamNameEl = document.getElementById('azDashTeamName');
    if (teamNameEl) teamNameEl.textContent = cleanProject;

    const noProjBanner = document.getElementById('azDashNoProjectBanner');
    if (noProjBanner) noProjBanner.classList.add('hidden');

    this.bindControls();
    this.setLoading(true);

    const criticalAlerts = {
      p1BugsCount: 0,
      offlineAgentsCount: 0,
      failedMainDeployments: 0
    };

    try {
      // Concurrently aggregate all Project Overview Metrics
      await Promise.allSettled([
        this.loadWorkItemsOverview(cleanProject, criticalAlerts),
        this.loadPipelinesOverview(cleanProject, criticalAlerts),
        this.loadReposAndPrsOverview(cleanProject),
        this.loadInfrastructureOverview(cleanProject, criticalAlerts),
        this.loadRecentActivityOverview(cleanProject)
      ]);

      // Render the conditional Critical Alerts Banner
      this.renderCriticalAlertsBanner(criticalAlerts);

      // Update Last updated timestamp
      this.updateLastUpdatedTimestamp();
    } catch (err) {
      console.error('Error during dashboard aggregation:', err);
    } finally {
      this.setLoading(false);
    }
  },

  // 1. Work Items Overview (WIQL & Status Distribution & P1 Bugs)
  async loadWorkItemsOverview(cleanProject, criticalAlerts) {
    try {
      const wiqlQuery = {
        query: `SELECT [System.Id], [System.WorkItemType], [System.State], [System.Title], [System.AssignedTo], [System.ChangedDate], [Microsoft.VSTS.Common.Severity], [Microsoft.VSTS.Common.Priority] FROM WorkItems WHERE [System.TeamProject] = @project ORDER BY [System.ChangedDate] DESC`
      };

      const wiqlUrl = `${encodeURIComponent(cleanProject)}/_apis/wit/wiql?$top=100&api-version=6.0`;
      let wiqlRes = await this.fetchApi(wiqlUrl, {
        method: 'POST',
        body: JSON.stringify(wiqlQuery)
      });

      if (!wiqlRes || !wiqlRes.workItems || wiqlRes.workItems.length === 0) {
        const fallbackWiql = {
          query: `SELECT [System.Id] FROM WorkItems WHERE [System.TeamProject] = '${cleanProject.replace(/'/g, "''")}' ORDER BY [System.ChangedDate] DESC`
        };
        wiqlRes = await this.fetchApi(wiqlUrl, {
          method: 'POST',
          body: JSON.stringify(fallbackWiql)
        });
      }

      const workItemIds = (wiqlRes?.workItems || []).slice(0, 100).map(w => w.id);
      let fullWorkItems = [];

      if (workItemIds.length > 0) {
        for (let i = 0; i < workItemIds.length; i += 50) {
          const chunk = workItemIds.slice(i, i + 50);
          const batchUrl = `${encodeURIComponent(cleanProject)}/_apis/wit/workitems?ids=${chunk.join(',')}&$expand=all&api-version=6.0`;
          const bData = await this.fetchApi(batchUrl);
          if (bData?.value) {
            fullWorkItems.push(...bData.value);
          }
        }
      }

      let activeCount = 0;
      let highPriBugsCount = 0;
      let closedCount = 0;
      let newCount = 0;
      let testingCount = 0;

      const typeDistribution = { Stories: 0, Tasks: 0, Bugs: 0, Other: 0 };

      fullWorkItems.forEach(item => {
        const f = item.fields || {};
        const state = (f['System.State'] || '').toLowerCase();
        const type = (f['System.WorkItemType'] || '').toLowerCase();
        const severity = String(f['Microsoft.VSTS.Common.Severity'] || '').toLowerCase();
        const priority = Number(f['Microsoft.VSTS.Common.Priority']) || 0;

        const isClosed = state === 'closed' || state === 'done' || state === 'resolved' || state === 'completed';
        const isBug = type.includes('bug') || type.includes('defect');

        if (isBug) {
          typeDistribution.Bugs++;
          if (!isClosed) {
            // Count High-Priority / P1 bugs
            if (severity.includes('1') || severity.includes('critical') || priority === 1) {
              criticalAlerts.p1BugsCount++;
              highPriBugsCount++;
            } else {
              highPriBugsCount++;
            }
          }
        } else if (type.includes('story') || type.includes('user story') || type.includes('requirement')) {
          typeDistribution.Stories++;
        } else if (type.includes('task')) {
          typeDistribution.Tasks++;
        } else {
          typeDistribution.Other++;
        }

        if (isClosed) {
          closedCount++;
        } else if (state === 'new' || state === 'to do' || state === 'proposed') {
          newCount++;
        } else if (state.includes('test') || state.includes('review') || state.includes('qa')) {
          testingCount++;
          activeCount++;
        } else {
          activeCount++;
        }
      });

      const totalScope = fullWorkItems.length;
      const completionPct = totalScope > 0 ? Math.round((closedCount / totalScope) * 100) : 0;

      // Update KPI Card 1
      const elActive = document.getElementById('dashKpiActiveWorkItems');
      if (elActive) elActive.textContent = activeCount.toLocaleString();

      const elTotalBadge = document.getElementById('dashKpiTotalScopeBadge');
      if (elTotalBadge) elTotalBadge.textContent = `${totalScope} items`;

      const elBugs = document.getElementById('dashKpiBugsCount');
      if (elBugs) elBugs.textContent = highPriBugsCount.toLocaleString();

      const elClosed = document.getElementById('dashKpiClosedCount');
      if (elClosed) elClosed.textContent = closedCount.toLocaleString();

      const elProg = document.getElementById('dashKpiWorkItemsProgress');
      if (elProg) elProg.style.width = `${completionPct}%`;

      // Render Work Item Status Distribution Chart
      this.lastWorkItemDist = {
        newCount,
        activeCount,
        testingCount,
        closedCount,
        totalScope,
        typeDistribution
      };
      this.renderWorkItemDistribution(this.lastWorkItemDist);

    } catch (err) {
      console.warn('Error loading work items overview:', err);
    }
  },

  // 2. Pipelines Overview (Pass Rate, Status Breakdown & Health Chart)
  async loadPipelinesOverview(cleanProject, criticalAlerts) {
    try {
      const buildsUrl = `${encodeURIComponent(cleanProject)}/_apis/build/builds?queryOrder=queueTimeDescending&$top=150&api-version=6.0`;
      const bData = await this.fetchApi(buildsUrl);
      const rawBuilds = bData?.value || [];

      // Filter by selected Time Range
      const cutoff = this.getTimeRangeCutoff();
      const builds = rawBuilds.filter(b => {
        const t = new Date(b.finishTime || b.queueTime || b.startTime);
        return !isNaN(t.getTime()) && t >= cutoff;
      });

      let passedCount = 0;
      let failedCount = 0;
      let runningCount = 0;

      builds.forEach(b => {
        const res = (b.result || '').toLowerCase();
        const stat = (b.status || '').toLowerCase();
        const branch = (b.sourceBranch || '').toLowerCase();

        if (res === 'succeeded') {
          passedCount++;
        } else if (res === 'failed' || res === 'partiallysucceeded') {
          failedCount++;
          // Check if failure occurred on main/master branch
          if (branch.includes('main') || branch.includes('master')) {
            criticalAlerts.failedMainDeployments++;
          }
        } else if (stat === 'inprogress' || stat === 'notstarted') {
          runningCount++;
        }
      });

      const totalRuns = passedCount + failedCount + runningCount;
      const evaluated = passedCount + failedCount;
      const passRate = evaluated > 0 ? Math.round((passedCount / evaluated) * 100) : (totalRuns > 0 ? 100 : 0);

      // Update KPI Card 2
      const elPassRate = document.getElementById('dashKpiPipelinePassRate');
      if (elPassRate) elPassRate.textContent = totalRuns > 0 ? `${passRate}%` : '—';

      const elRateBadge = document.getElementById('dashKpiPipelineRateBadge');
      if (elRateBadge) elRateBadge.textContent = totalRuns > 0 ? `${passRate}% Pass` : '0% Pass';

      const elTotal = document.getElementById('dashKpiPipelineTotalRuns');
      if (elTotal) elTotal.textContent = totalRuns.toLocaleString();

      const elPassed = document.getElementById('dashKpiPipelinePassed');
      if (elPassed) elPassed.textContent = passedCount.toLocaleString();

      const elFailed = document.getElementById('dashKpiPipelineFailed');
      if (elFailed) elFailed.textContent = failedCount.toLocaleString();

      const elRunning = document.getElementById('dashKpiPipelineRunning');
      if (elRunning) elRunning.textContent = runningCount.toLocaleString();

      const elProg = document.getElementById('dashKpiPipelineProgress');
      if (elProg) elProg.style.width = `${passRate}%`;

      // Update Chart Header Badge
      const ratioBadge = document.getElementById('dashPipelineHealthRatio');
      if (ratioBadge) {
        ratioBadge.textContent = `${passRate}% Pass Rate`;
        ratioBadge.style.background = passRate >= 80 ? 'rgba(16, 124, 16, 0.15)' : 'rgba(209, 52, 56, 0.15)';
        ratioBadge.style.color = passRate >= 80 ? '#107c10' : '#d13438';
      }

      // Render Visual 1: Pipeline Health Chart
      this.lastPipelineHealth = { passed: passedCount, failed: failedCount, running: runningCount };
      this.renderPipelineHealthChart(passedCount, failedCount, runningCount);

    } catch (err) {
      console.warn('Error loading pipelines overview:', err);
    }
  },

  // 3. Repositories & Pull Requests (Active Repos, Open PRs Table)
  async loadReposAndPrsOverview(cleanProject) {
    try {
      const reposUrl = `${encodeURIComponent(cleanProject)}/_apis/git/repositories?api-version=7.1-preview.1`;
      const rData = await this.fetchApi(reposUrl);
      const repos = rData?.value || [];

      // Query active pull requests across all project repositories
      let openPrs = [];
      const prsUrl = `${encodeURIComponent(cleanProject)}/_apis/git/pullrequests?searchCriteria.status=active&api-version=6.0&$top=50`;
      const prData = await this.fetchApi(prsUrl);
      openPrs = prData?.value || [];

      if (openPrs.length === 0 && repos.length > 0) {
        for (const repo of repos.slice(0, 4)) {
          const perRepoUrl = `${encodeURIComponent(cleanProject)}/_apis/git/repositories/${repo.id}/pullrequests?searchCriteria.status=active&api-version=6.0&$top=15`;
          const d = await this.fetchApi(perRepoUrl);
          if (d?.value && d.value.length > 0) {
            openPrs.push(...d.value);
          }
        }
      }

      // Filter PRs by selected Time Range
      const cutoff = this.getTimeRangeCutoff();
      const filteredPrs = openPrs.filter(pr => {
        const d = new Date(pr.creationDate);
        return !isNaN(d.getTime()) && d >= cutoff;
      });

      const displayPrs = filteredPrs.length > 0 ? filteredPrs : openPrs;

      // Update KPI Card 3
      const elPrCount = document.getElementById('dashKpiOpenPrsCount');
      if (elPrCount) elPrCount.textContent = openPrs.length.toLocaleString();

      const elReposBadge = document.getElementById('dashKpiReposCountBadge');
      if (elReposBadge) elReposBadge.textContent = `${repos.length} Repos`;

      const elActiveRepos = document.getElementById('dashKpiActiveReposCount');
      if (elActiveRepos) elActiveRepos.textContent = repos.length.toLocaleString();

      const elActiveBranches = document.getElementById('dashKpiActiveBranchesCount');
      if (elActiveBranches) elActiveBranches.textContent = openPrs.length.toLocaleString();

      const elPrProg = document.getElementById('dashKpiPrProgress');
      if (elPrProg) {
        const prFill = Math.min(100, openPrs.length * 20);
        elPrProg.style.width = `${prFill}%`;
      }

      // Update PR Count Badge
      const prBadge = document.getElementById('azDashPrCountBadge');
      if (prBadge) prBadge.textContent = openPrs.length.toLocaleString();

      // Render Visual 3: Open PR Review Status Table
      this.renderOpenPrTable(displayPrs);

    } catch (err) {
      console.warn('Error loading repos and PRs overview:', err);
    }
  },

  // 4. Infrastructure Overview (Agent Pools & Service Connections)
  async loadInfrastructureOverview(cleanProject, criticalAlerts) {
    try {
      let onlinePools = 0;
      let totalPools = 0;
      let offlineAgents = 0;

      // 1. Agent Pools / Queues
      const queuesUrl = `${encodeURIComponent(cleanProject)}/_apis/distributedtask/queues?api-version=6.0`;
      const qData = await this.fetchApi(queuesUrl);
      const queues = qData?.value || [];
      totalPools = queues.length;
      
      queues.forEach(q => {
        if (q.pool?.isOnline === false) offlineAgents++;
        else onlinePools++;
      });

      if (totalPools === 0) {
        const pData = await this.fetchApi('_apis/distributedtask/pools?api-version=6.0');
        const pools = pData?.value || [];
        totalPools = pools.length;
        pools.forEach(p => {
          if (p.offline) offlineAgents++;
          else onlinePools++;
        });
      }

      criticalAlerts.offlineAgentsCount += offlineAgents;

      // 2. Service Endpoints / Cloud Connections
      const epUrl = `${encodeURIComponent(cleanProject)}/_apis/serviceendpoint/endpoints?api-version=6.0`;
      const epData = await this.fetchApi(epUrl);
      const endpointsCount = (epData?.value || []).length;

      // Update KPI Card 4
      const elPools = document.getElementById('dashKpiOnlinePoolsCount');
      if (elPools) {
        elPools.textContent = totalPools > 0 ? `${onlinePools}/${totalPools}` : (endpointsCount > 0 ? `${endpointsCount}` : 'Operational');
      }

      const elEndpoints = document.getElementById('dashKpiEndpointsCount');
      if (elEndpoints) elEndpoints.textContent = endpointsCount.toLocaleString();

    } catch (err) {
      console.warn('Error loading infrastructure overview:', err);
    }
  },

  // 5. Recent Activity Stream (Commits, Pipeline Runs & Work Item Updates)
  async loadRecentActivityOverview(cleanProject) {
    try {
      const activities = [];

      // A. Recent Commits
      const reposUrl = `${encodeURIComponent(cleanProject)}/_apis/git/repositories?api-version=7.1-preview.1`;
      const rData = await this.fetchApi(reposUrl);
      const repos = rData?.value || [];

      if (repos.length > 0) {
        for (const primaryRepo of repos.slice(0, 3)) {
          const commitsUrl = `${encodeURIComponent(cleanProject)}/_apis/git/repositories/${primaryRepo.id}/commits?$top=5&api-version=6.0`;
          const cData = await this.fetchApi(commitsUrl);
          (cData?.value || []).forEach(c => {
            activities.push({
              type: 'commit',
              title: c.comment ? c.comment.split('\n')[0] : 'Code commit pushed',
              author: c.author?.name || 'Developer',
              date: c.author?.date || c.committer?.date,
              meta: primaryRepo.name
            });
          });
        }
      }

      // B. Recent Completed Builds
      const buildsUrl = `${encodeURIComponent(cleanProject)}/_apis/build/builds?queryOrder=queueTimeDescending&$top=8&api-version=6.0`;
      const bData = await this.fetchApi(buildsUrl);
      (bData?.value || []).forEach(b => {
        const res = (b.result || 'started').toUpperCase();
        activities.push({
          type: 'build',
          title: `Pipeline ${b.definition?.name || 'Build'} [${res}]`,
          author: b.requestedFor?.displayName || 'CI/CD Engine',
          date: b.finishTime || b.queueTime,
          meta: `Build #${b.buildNumber || b.id}`
        });
      });

      // Filter activities by selected Time Range
      const cutoff = this.getTimeRangeCutoff();
      const filtered = activities.filter(a => {
        const d = new Date(a.date);
        return !isNaN(d.getTime()) && d >= cutoff;
      });

      const displayActivities = filtered.length > 0 ? filtered : activities;
      displayActivities.sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0));

      // Render Visual 4: Recent Activity List
      this.renderRecentActivity(displayActivities.slice(0, 10));

    } catch (err) {
      console.warn('Error loading recent activity:', err);
    }
  },

  // Render Conditional Critical Alerts Banner (Disabled)
  renderCriticalAlertsBanner(alerts) {
    const banner = document.getElementById('azDashCriticalAlertsBanner');
    if (banner) {
      banner.classList.add('hidden');
      banner.style.display = 'none';
    }
  },

  // Visual 1: Render Pipeline Health Chart (Chart.js Doughnut)
  renderPipelineHealthChart(passed, failed, running) {
    const canvas = document.getElementById('azDashPipelineHealthCanvas');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (this.pipelineHealthChart) this.pipelineHealthChart.destroy();

    // Update legend numbers
    const lPassed = document.getElementById('azLegendPipePassed');
    if (lPassed) lPassed.textContent = passed.toLocaleString();
    const lFailed = document.getElementById('azLegendPipeFailed');
    if (lFailed) lFailed.textContent = failed.toLocaleString();
    const lRunning = document.getElementById('azLegendPipeRunning');
    if (lRunning) lRunning.textContent = running.toLocaleString();

    const isDark = document.body.classList.contains('theme-dark') || window.HubApp?.currentTheme === 'dark';
    const total = passed + failed + running;

    const dataValues = total > 0 ? [passed, failed, running] : [1];
    const bgColors = total > 0
      ? ['#107c10', '#d13438', '#0078d4']
      : [isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.08)'];

    this.pipelineHealthChart = new Chart(ctx, {
      type: 'doughnut',
      data: {
        labels: total > 0 ? ['Passed', 'Failed', 'In-Progress'] : ['No Runs'],
        datasets: [{
          data: dataValues,
          backgroundColor: bgColors,
          borderWidth: 2,
          borderColor: isDark ? '#1e293b' : '#ffffff',
          hoverOffset: 6
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        cutout: '72%',
        plugins: {
          legend: { display: false },
          tooltip: {
            enabled: total > 0,
            backgroundColor: isDark ? '#0f172a' : '#1e293b',
            titleColor: '#ffffff',
            bodyColor: '#e2e8f0',
            padding: 10,
            callbacks: {
              label: (context) => {
                const val = context.parsed || 0;
                const pct = total > 0 ? Math.round((val / total) * 100) : 0;
                return ` ${context.label}: ${val} runs (${pct}%)`;
              }
            }
          }
        }
      }
    });
  },

  // Visual 2: Render Work Item Status Distribution (Chart.js Bar Chart)
  renderWorkItemDistribution(data) {
    const canvas = document.getElementById('azDashWorkItemDistCanvas');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (this.workItemDistChart) this.workItemDistChart.destroy();

    // Update legend numbers
    const lNew = document.getElementById('azLegendWiNew');
    if (lNew) lNew.textContent = (data.newCount || 0).toLocaleString();
    const lActive = document.getElementById('azLegendWiActive');
    if (lActive) lActive.textContent = (data.activeCount || 0).toLocaleString();
    const lTesting = document.getElementById('azLegendWiTesting');
    if (lTesting) lTesting.textContent = (data.testingCount || 0).toLocaleString();
    const lClosed = document.getElementById('azLegendWiClosed');
    if (lClosed) lClosed.textContent = (data.closedCount || 0).toLocaleString();

    const tBadge = document.getElementById('dashWorkItemTotalCountBadge');
    if (tBadge) tBadge.textContent = `${(data.totalScope || 0).toLocaleString()} Total`;

    const isDark = document.body.classList.contains('theme-dark') || window.HubApp?.currentTheme === 'dark';
    const textColor = isDark ? '#94a3b8' : '#64748b';
    const gridColor = isDark ? 'rgba(255, 255, 255, 0.06)' : 'rgba(0, 0, 0, 0.06)';

    this.workItemDistChart = new Chart(ctx, {
      type: 'bar',
      data: {
        labels: ['New', 'Active', 'In Testing', 'Closed'],
        datasets: [{
          label: 'Items',
          data: [data.newCount || 0, data.activeCount || 0, data.testingCount || 0, data.closedCount || 0],
          backgroundColor: [
            'rgba(2, 132, 199, 0.85)',
            'rgba(0, 120, 212, 0.85)',
            'rgba(234, 179, 8, 0.85)',
            'rgba(16, 124, 16, 0.85)'
          ],
          borderColor: ['#0284c7', '#0078d4', '#eab308', '#107c10'],
          borderWidth: 1,
          borderRadius: 4
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: {
            backgroundColor: isDark ? '#0f172a' : '#1e293b',
            titleColor: '#ffffff',
            bodyColor: '#e2e8f0',
            padding: 10
          }
        },
        scales: {
          x: {
            grid: { display: false },
            ticks: { color: textColor, font: { size: 11, weight: '600' } }
          },
          y: {
            grid: { color: gridColor },
            ticks: { color: textColor, font: { size: 10 }, precision: 0 },
            beginAtZero: true
          }
        }
      }
    });
  },

  updatePipelineMonthlyView() {
    if (this.lastPipelineHealth) {
      this.renderPipelineHealthChart(
        this.lastPipelineHealth.passed,
        this.lastPipelineHealth.failed,
        this.lastPipelineHealth.running
      );
    }
    if (this.lastWorkItemDist) {
      this.renderWorkItemDistribution(this.lastWorkItemDist);
    }
  },

  // Visual 3: Render Open PR Review Status Table
  renderOpenPrTable(prs) {
    const container = document.getElementById('azDashOpenPrContainer');
    if (!container) return;

    if (!prs || prs.length === 0) {
      container.innerHTML = `
        <div class="az-empty-dash-state" style="padding:28px 0;">
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" style="color:#107c10;">
            <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path>
            <polyline points="22 4 12 14.01 9 11.01"></polyline>
          </svg>
          <div style="font-weight:600; margin-top:8px;">All Pull Requests Reviewed</div>
          <div style="font-size:11px; color:var(--text-muted); margin-top:3px;">No open pull requests awaiting review in this project.</div>
        </div>
      `;
      return;
    }

    const self = this;
    const html = `
      <table class="az-dash-pr-table">
        <thead>
          <tr>
            <th style="width:70px;">PR ID</th>
            <th>Title &amp; Target</th>
            <th>Repository</th>
            <th>Author</th>
            <th>Review Status</th>
            <th style="text-align:right;">Age</th>
          </tr>
        </thead>
        <tbody>
          ${prs.map(pr => {
            const title = self.escapeHtml(pr.title || 'Untitled Pull Request');
            const targetBranch = self.escapeHtml((pr.targetRefName || '').replace('refs/heads/', ''));
            const sourceBranch = self.escapeHtml((pr.sourceRefName || '').replace('refs/heads/', ''));
            const repoName = self.escapeHtml(pr.repository?.name || 'Repository');
            const authorName = self.escapeHtml(pr.createdBy?.displayName || 'Author');
            const initials = (authorName.split(' ').map(n => n[0]).join('') || 'PR').substring(0, 2).toUpperCase();
            const relAge = self.formatRelativeTime(pr.creationDate);
            const prUrl = pr._links?.web?.href || `https://dev.azure.com/${self.currentOrg}/${encodeURIComponent(self.currentProject)}/_git/${encodeURIComponent(pr.repository?.name || '')}/pullrequest/${pr.pullRequestId}`;

            // Votes status summary
            const reviewers = pr.reviewers || [];
            const approvedCount = reviewers.filter(r => r.vote > 0).length;
            const waitingCount = reviewers.filter(r => r.vote === 0).length;
            const rejectedCount = reviewers.filter(r => r.vote < 0).length;

            let statusBadge = '<span class="az-kpi-chip chip-blue">Under Review</span>';
            if (rejectedCount > 0) statusBadge = '<span class="az-kpi-chip chip-red">Changes Requested</span>';
            else if (approvedCount > 0) statusBadge = `<span class="az-kpi-chip chip-green">✓ ${approvedCount} Approved</span>`;
            else if (waitingCount > 0) statusBadge = `<span class="az-kpi-chip chip-purple">${waitingCount} Reviewer${waitingCount > 1 ? 's' : ''}</span>`;

            return `
              <tr>
                <td><strong style="color:var(--azure-blue);">#${pr.pullRequestId}</strong></td>
                <td>
                  <a href="${prUrl}" target="_blank" rel="noopener" class="az-pr-title-link">${title}</a>
                  <div class="az-pr-branch-tag">${sourceBranch} → ${targetBranch}</div>
                </td>
                <td><span class="az-pr-repo-badge">${repoName}</span></td>
                <td>
                  <div class="az-pr-author-cell">
                    <span class="az-pr-avatar">${initials}</span>
                    <span>${authorName}</span>
                  </div>
                </td>
                <td>${statusBadge}</td>
                <td style="text-align:right; font-size:11px; color:var(--text-muted);">${relAge}</td>
              </tr>
            `;
          }).join('')}
        </tbody>
      </table>
    `;

    container.innerHTML = html;
  },

  // Visual 4: Render Recent Activity Stream
  renderRecentActivity(activities) {
    const container = document.getElementById('azDashRecentActivityList');
    if (!container) return;

    if (!activities || activities.length === 0) {
      container.innerHTML = `
        <div class="az-empty-dash-state" style="padding:24px 0;">
          <div style="font-size:11px; color:var(--text-muted);">No recent project activity recorded.</div>
        </div>
      `;
      return;
    }

    const self = this;
    const html = `
      <div class="az-activity-feed">
        ${activities.map(act => {
          const type = act.type || 'commit';
          const iconClass = type === 'build' ? 'act-build' : (type === 'pr' ? 'act-pr' : (type === 'wi' ? 'act-wi' : 'act-commit'));
          const relTime = self.formatRelativeTime(act.date);

          let iconSvg = '';
          if (type === 'build') {
            iconSvg = '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg>';
          } else if (type === 'pr') {
            iconSvg = '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="18" cy="18" r="3"></circle><circle cx="6" cy="6" r="3"></circle><path d="M13 6h3a2 2 0 0 1 2 2v7"></path><line x1="6" y1="9" x2="6" y2="21"></line></svg>';
          } else if (type === 'wi') {
            iconSvg = '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect><line x1="9" y1="9" x2="15" y2="9"></line></svg>';
          } else {
            iconSvg = '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="4"></circle><line x1="1.05" y1="12" x2="7" y2="12"></line><line x1="17.01" y1="12" x2="22.96" y2="12"></line></svg>';
          }

          return `
            <div class="az-act-item">
              <div class="az-act-icon-box ${iconClass}">
                ${iconSvg}
              </div>
              <div class="az-act-desc">
                <div style="font-weight:600; color:var(--text-main);">${self.escapeHtml(act.title)}</div>
                <div style="font-size:10.5px; color:var(--text-muted); margin-top:1px;">
                  <span>${self.escapeHtml(act.author)}</span>
                  ${act.meta ? ` • <span style="color:var(--azure-blue); font-weight:500;">${self.escapeHtml(act.meta)}</span>` : ''}
                </div>
                <div class="az-act-time">${relTime}</div>
              </div>
            </div>
          `;
        }).join('')}
      </div>
    `;

    container.innerHTML = html;
  },

  // Event Listeners & Interaction Binding
  bindControls() {
    if (this.eventsBound) return;
    this.eventsBound = true;

    // Time Range Selector
    document.getElementById('dashTimeRangeSelect')?.addEventListener('change', (e) => {
      this.currentTimeRange = e.target.value || '7d';
      if (this.currentOrg && this.currentProject && this.currentPat) {
        this.init(this.currentOrg, this.currentProject, this.currentPat);
      }
    });

    // Refresh Dashboard Button
    document.getElementById('btnRefreshDashboard')?.addEventListener('click', () => {
      if (this.currentOrg && this.currentProject && this.currentPat) {
        this.init(this.currentOrg, this.currentProject, this.currentPat);
      }
    });

    // Click-to-Navigate Deep Links for Overview KPI Cards
    document.getElementById('kpiCardWorkItems')?.addEventListener('click', () => {
      if (window.HubApp && typeof window.HubApp.switchView === 'function') {
        window.HubApp.switchView('workitems');
        window.HubApp.triggerActiveInspect();
      }
    });

    document.getElementById('kpiCardPipelines')?.addEventListener('click', () => {
      if (window.HubApp && typeof window.HubApp.switchView === 'function') {
        window.HubApp.switchView('pipelines');
        window.HubApp.triggerActiveInspect();
      }
    });

    document.getElementById('kpiCardReposPrs')?.addEventListener('click', () => {
      if (window.HubApp && typeof window.HubApp.switchView === 'function') {
        window.HubApp.switchView('repositories');
      }
    });

    document.getElementById('kpiCardInfrastructure')?.addEventListener('click', () => {
      if (window.HubApp && typeof window.HubApp.switchView === 'function') {
        window.HubApp.switchView('agentpools');
        window.HubApp.triggerActiveInspect();
      }
    });

    // Jump to PRs view button
    document.getElementById('btnDashJumpToPrs')?.addEventListener('click', () => {
      if (window.HubApp && typeof window.HubApp.switchView === 'function') {
        const repoSelect = document.getElementById('repoSelect');
        if (repoSelect) repoSelect.value = '-- All Repositories --';
        window.HubApp.switchView('prs');
        window.HubApp.triggerActiveInspect();
      }
    });

    // Fullscreen Toggle
    document.getElementById('btnDashFullscreen')?.addEventListener('click', () => {
      const container = document.getElementById('view-dashboard');
      if (!container) return;
      if (!document.fullscreenElement) {
        container.requestFullscreen().catch(err => console.warn('Fullscreen notice:', err));
      } else {
        document.exitFullscreen().catch(err => console.warn('Exit fullscreen notice:', err));
      }
    });

    // Project Picker Toolbar Dropdown
    const pickerBtn = document.getElementById('azDashTeamPicker');
    const menuEl = document.getElementById('azDashProjectMenu');
    const searchInput = document.getElementById('azDashProjectSearch');

    pickerBtn?.addEventListener('click', (e) => {
      e.stopPropagation();
      menuEl?.classList.toggle('hidden');
      if (!menuEl?.classList.contains('hidden')) {
        this.populateProjectPickerMenu();
        searchInput?.focus();
      }
    });

    searchInput?.addEventListener('input', (e) => {
      this.filterProjectPickerMenu(e.target.value);
    });

    document.addEventListener('click', (e) => {
      if (menuEl && !menuEl.classList.contains('hidden')) {
        if (!menuEl.contains(e.target) && !pickerBtn?.contains(e.target)) {
          menuEl.classList.add('hidden');
        }
      }
    });

    document.getElementById('btnBannerSelectProject')?.addEventListener('click', () => {
      pickerBtn?.click();
    });
  },

  populateProjectPickerMenu() {
    const listEl = document.getElementById('azDashProjectList');
    if (!listEl) return;

    let projects = [];
    if (window.HubApp && Array.isArray(window.HubApp.cachedProjects) && window.HubApp.cachedProjects.length > 0) {
      projects = window.HubApp.cachedProjects;
    } else {
      const selectEl = document.getElementById('projectSelect');
      if (selectEl) {
        Array.from(selectEl.options).forEach(opt => {
          if (opt.value && opt.value !== '') {
            projects.push({ name: opt.text || opt.value, id: opt.value });
          }
        });
      }
    }

    this.cachedProjects = projects;
    this.renderProjectPickerItems(projects);
  },

  renderProjectPickerItems(projects) {
    const listEl = document.getElementById('azDashProjectList');
    if (!listEl) return;

    if (!projects || projects.length === 0) {
      listEl.innerHTML = '<div class="az-dash-project-empty">No authorized projects available for your account.</div>';
      return;
    }

    const self = this;
    const isOrgAdmin = window.HubApp?.isOrgAdmin;
    const scopeHeader = isOrgAdmin
      ? `<div class="az-dash-project-scope-header admin-scope">👑 Organization Admin (${projects.length} Projects)</div>`
      : `<div class="az-dash-project-scope-header user-scope">👤 Assigned Projects (${projects.length})</div>`;

    listEl.innerHTML = scopeHeader + projects.map(p => {
      const pName = typeof p === 'string' ? p : (p.name || p.id);
      const isSelected = pName === self.currentProject;
      return `
        <div class="az-dash-project-item ${isSelected ? 'selected' : ''}" data-project="${self.escapeHtml(pName)}">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <rect x="3" y="3" width="7" height="7"></rect>
            <rect x="14" y="3" width="7" height="7"></rect>
            <rect x="14" y="14" width="7" height="7"></rect>
            <rect x="3" y="14" width="7" height="7"></rect>
          </svg>
          <span style="flex:1;">${self.escapeHtml(pName)}</span>
          ${isSelected ? '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#0078d4" stroke-width="2.5"><polyline points="20 6 9 17 4 12"></polyline></svg>' : ''}
        </div>
      `;
    }).join('');

    listEl.querySelectorAll('.az-dash-project-item').forEach(item => {
      item.addEventListener('click', () => {
        const proj = item.dataset.project;
        if (!proj) return;
        document.getElementById('azDashProjectMenu')?.classList.add('hidden');

        // Sync with top bar select if present
        const topSelect = document.getElementById('projectSelect');
        if (topSelect) {
          topSelect.value = proj;
        }

        if (window.HubApp && typeof window.HubApp.handleProjectChange === 'function') {
          window.HubApp.handleProjectChange(proj);
        } else {
          self.init(self.currentOrg, proj, self.currentPat);
        }
      });
    });
  },

  filterProjectPickerMenu(query) {
    const q = (query || '').toLowerCase().trim();
    const filtered = (this.cachedProjects || []).filter(p => {
      const name = (typeof p === 'string' ? p : (p.name || p.id || '')).toLowerCase();
      return name.includes(q);
    });
    this.renderProjectPickerItems(filtered);
  }
};
