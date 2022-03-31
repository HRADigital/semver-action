const github = require('@actions/github')
const core = require('@actions/core')
const _ = require('lodash')
const cc = require('@conventional-commits/parser')
const semver = require('semver')

async function main () {
  const token = core.getInput('token')
  const branch = core.getInput('branch')
  const gh = github.getOctokit(token)
  const owner = github.context.repo.owner
  const repo = github.context.repo.repo

  const bumpTypes = {
    major: core.getInput('majorList').split(',').map(p => p.trim()).filter(p => p),
    majorTitle: core.getInput('majorTitle').trim(),
    majorEmoji: core.getInput('majorEmoji').trim(),
    minor: core.getInput('minorList').split(',').map(p => p.trim()).filter(p => p),
    minorTitle: core.getInput('minorTitle').trim(),
    minorEmoji: core.getInput('minorEmoji').trim(),
    patch: core.getInput('patchList').split(',').map(p => p.trim()).filter(p => p),
    patchTitle: core.getInput('patchTitle').trim(),
    patchEmoji: core.getInput('patchEmoji').trim(),
    patchAll: (core.getInput('patchAll') === true || core.getInput('patchAll') === 'true'),
    contributorsTitle: core.getInput('contributorsTitle').trim(),
    contributorsEmoji: core.getInput('contributorsEmoji').trim(),
  }

  // GET LATEST + PREVIOUS TAGS

  const tagsRaw = await gh.graphql(`
    query lastTags ($owner: String!, $repo: String!) {
      repository (owner: $owner, name: $repo) {
        refs(first: 1, refPrefix: "refs/tags/", orderBy: { field: TAG_COMMIT_DATE, direction: DESC }) {
          nodes {
            name
            target {
              oid
            }
          }
        }
      }
    }
  `, {
    owner,
    repo
  })

  const latestTag = _.get(tagsRaw, 'repository.refs.nodes[0]')

  if (!latestTag) {
    return core.setFailed('Couldn\'t find the latest tag. Make sure you have at least one tag created first.')
  }

  core.info(`Comparing against latest tag: ${latestTag.name}`)

  // GET COMMITS

  let curPage = 0
  let totalCommits = 0
  let hasMoreCommits = false
  const commits = []
  do {
    hasMoreCommits = false
    curPage++
    const commitsRaw = await gh.rest.repos.compareCommitsWithBasehead({
      owner,
      repo,
      basehead: `${latestTag.name}...${branch}`,
      page: curPage,
      per_page: 100
    })
    totalCommits = _.get(commitsRaw, 'data.total_commits', 0)
    const rangeCommits = _.get(commitsRaw, 'data.commits', [])
    commits.push(...rangeCommits)
    if ((curPage - 1) * 100 + rangeCommits.length < totalCommits) {
      hasMoreCommits = true
    }
  } while (hasMoreCommits)

  if (!commits || commits.length < 1) {
    return core.setFailed('Couldn\'t find any commits between HEAD and latest tag.')
  }

  // PARSE COMMITS

  const majorChanges = []
  const minorChanges = []
  const patchChanges = []
  const authors = []

  let processCommit = (commit, versionChanges, type, versionName, isBreakChange = false) => {
    versionChanges.push(commit.commit.message)

    let existingAuthor = authors.find((item, index) => item.login === commit.author.login)

    if (typeof existingAuthor === 'undefined') {
      authors.push({
        "login": commit.author.login,
        "name": commit.commit.author.name,
        "url": commit.author.html_url
      })
    }

    let infoTxt = `[${versionName.toUpperCase()}] Commit ${commit.sha} `
    if (isBreakChange) {
      infoTxt += `has a BREAKING CHANGE mention, causing`
    } else {
      infoTxt += `of type ${type} will cause`
    }
    infoTxt += ` a ${versionName.toLowerCase()} version bump.`
    core.info(infoTxt)
  };

  for (const commit of commits) {
    try {
      const cAst = cc.toConventionalChangelogFormat(cc.parser(commit.commit.message))
      if (bumpTypes.major.includes(cAst.type)) {
        processCommit(commit, majorChanges, cAst.type, 'major')
      } else if (bumpTypes.minor.includes(cAst.type)) {
        processCommit(commit, minorChanges, cAst.type, 'minor')
      } else if (bumpTypes.patchAll || bumpTypes.patch.includes(cAst.type)) {
        processCommit(commit, patchChanges, cAst.type, 'patch')
      } else {
        core.info(`[SKIP] Commit ${commit.sha} of type ${cAst.type} will not cause any version bump.`)
      }
      for (const note of cAst.notes) {
        if (note.title === 'BREAKING CHANGE') {
          processCommit(commit, patchChanges, cAst.type, 'major', true)
        }
      }
    } catch (err) {
      core.info(`[INVALID] Skipping commit ${commit.sha} as it doesn't follow conventional commit format.`)
    }
  }
  core.info(`MAJOR: \n` + JSON.stringify(majorChanges))
  core.info(`MINOR: \n` + JSON.stringify(minorChanges))
  core.info(`PATCH: \n` + JSON.stringify(patchChanges))
  core.info(`AUTHORS: \n` + JSON.stringify(authors))

  let bump = null
  if (majorChanges.length > 0) {
    bump = 'major'
  } else if (minorChanges.length > 0) {
    bump = 'minor'
  } else if (patchChanges.length > 0) {
    bump = 'patch'
  } else {
    return core.setFailed('No commit resulted in a version bump since last release!')
  }
  core.info(`\n>>> Will bump version ${latestTag.name} using ${bump.toUpperCase()}\n`)

  // BUMP VERSION

  const next = semver.inc(latestTag.name, bump)

  core.info(`Current version is ${latestTag.name}`)
  core.info(`Next version is v${next}`)

  // BUILD CHANGELOG

  buildVersionSection = (title, entries, emoji) => {
    let section = '## ';
    if (emoji.length > 0) {
      section += `${emoji} `;
    }
    section += `${title}%0A%0A `;

    entries.forEach((entry) => {
      section += `- ${entry}%0A `;
    })
    section += `%0A `;

    return section
  }

  buildAuthorsSection = (title, authors, emoji) => {
    let section = '## ';
    if (emoji.length > 0) {
      section += `${emoji} `;
    }
    section += `${title}%0A%0A `;

    authors.forEach((author) => {
      section += `- [@${author.login}](${author.url}) ${author.name}%0A `;
    })
    section += `%0A `;

    return section
  }

  var changeLog = `# Release v${next}%0A%0A`;
  if (majorChanges.length > 0 && bumpTypes.majorTitle.length > 0) {
    changeLog += buildVersionSection(bumpTypes.majorTitle, majorChanges, bumpTypes.majorEmoji)
  }
  if (minorChanges.length > 0 && bumpTypes.minorTitle.length > 0) {
    changeLog += buildVersionSection(bumpTypes.minorTitle, minorChanges, bumpTypes.minorEmoji)
  }
  if (patchChanges.length > 0 && bumpTypes.patchTitle.length > 0) {
    changeLog += buildVersionSection(bumpTypes.patchTitle, patchChanges, bumpTypes.patchEmoji)
  }
  //if (authors.length > 0 && bumpTypes.contributorsTitle.length > 0) {
    changeLog += buildAuthorsSection(bumpTypes.contributorsTitle, authors, bumpTypes.contributorsEmoji)
  //}

  core.info(`CHANGELOG : %0A${changeLog}%0A`)

  // EXPORT VALUES

  core.exportVariable('current', latestTag.name)
  core.exportVariable('next', `v${next}`)
  core.exportVariable('nextStrict', next)
  core.exportVariable('changeLog', changeLog)
}

main()
