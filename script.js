
const searchBar = document.getElementById('search-bar');
const loader = document.getElementById('loading-spinner');

// Initialize packageList from localStorage if available
let packageList = localStorage.getItem('packageList') ? JSON.parse(localStorage.getItem('packageList')) : { "rewpkgs": "//raw.githubusercontent.com/kevinJ045/rewpkgs/main/main.yaml" };
const packageListElement = document.getElementById('packages');

const renderPackages = () => {
  packageListElement.innerHTML = "";
  for (let pkg in packageList) {
    renderPackage(pkg, packageList[pkg]);
  }
};

const addPackage = () => {
  const li = document.createElement('li');
  const keyEl = document.createElement('input');
  keyEl.type = 'text';
  keyEl.placeholder = 'Package Key';
  
  const urlEl = document.createElement('input');
  urlEl.type = 'text';
  urlEl.placeholder = 'Package URL';
  
  const saveButton = document.createElement('button');
  saveButton.textContent = 'Save';
  
  saveButton.addEventListener('click', () => {
    const newPkg = keyEl.value.trim();
    const newUrl = urlEl.value.trim();
    if (newPkg && newUrl) {
      packageList[newPkg] = newUrl;
      localStorage.setItem('packageList', JSON.stringify(packageList));
      renderPackages();
    }
  });
  
  li.appendChild(keyEl);
  li.appendChild(document.createTextNode(': '));
  li.appendChild(urlEl);
  li.appendChild(saveButton);
  
  packageListElement.appendChild(li);
}

function showLoading(){
  searchBar.disabled = true;
  loader.style.display = 'block';
}


function hideLoading(){
  searchBar.disabled = false;
  loader.style.display = 'none';
}

// Function to render a single package
const renderPackage = (pkg, url) => {
  const li = document.createElement('li');
  const keyEl = document.createElement('code');
  const urlEl = document.createElement('a');
  urlEl.innerText = urlEl.href = url;
  keyEl.innerText = pkg;
  li.appendChild(keyEl);
  li.appendChild(document.createTextNode(': '));
  li.appendChild(urlEl);
  packageListElement.appendChild(li);
};

async function getRepoJson(repoUrl) {
  try {
    const res = await fetch(repoUrl.startsWith('//.') ? 'http://' + repoUrl.slice(3) :
      repoUrl.startsWith('//') ? 'https://' + repoUrl : repoUrl);
    const text = await res.text();
    const json = text.startsWith('---') || text.startsWith('%YAML') ? jsyaml.loadAll(text)[0] : JSON.parse(text);

    if (Array.isArray(json.include)) {
      for (let i of json.include) {
        json.packages = {
          ...json.packages,
          ...((await getRepoJson(i.startsWith('.') ? new URL(i, repoUrl).href : i)).packages || {})
        };
      }
    }
    return json;
  } catch (e) {
    console.error('Fetch Error. Check your connection.', e);
    return {};
  }
}

function setupIndexedDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('packagesDB', 1);
    request.onerror = (event) => reject('Database error:', event.target.errorCode);
    request.onsuccess = (event) => resolve(event.target.result);
    request.onupgradeneeded = (event) => {
      const db = event.target.result;
      db.createObjectStore('packages', { keyPath: 'name' });
    };
  });
}

async function storePackages(packages) {
  const db = await setupIndexedDB();
  const transaction = db.transaction(['packages'], 'readwrite');
  const store = transaction.objectStore('packages');
  for (let pkg of packages) {
    store.put(pkg);
  }
}

async function searchPackages(term) {
  const db = await setupIndexedDB();
  const transaction = db.transaction(['packages'], 'readonly');
  const store = transaction.objectStore('packages');
  const packages = [];
  return new Promise((resolve) => {
    store.openCursor().onsuccess = (event) => {
      const cursor = event.target.result;
      if (cursor) {
        const pkg = cursor.value;
        if (pkg.name.toLowerCase().includes(term.toLowerCase()) || (pkg['package.json'] && JSON.parse(pkg['package.json']).keywords?.some((keyword) => keyword.toLowerCase().includes(term.toLowerCase())))) {
          packages.push(pkg);
        }
        cursor.continue();
      } else {
        resolve(packages);
      }
    };
  });
}

function parseMarkdown(markdown){
  return new showdown.Converter().makeHtml(markdown);
}

function createResultItem(pkg) {
  const { name, 'package.json': packageJson, 'README.md': readme } = pkg;
  const description = packageJson ? JSON.parse(packageJson).description || "None" : "None";
  const keywords = packageJson ? (JSON.parse(packageJson).keywords || []).map(tag => `<span class="tag">${tag}</span>`).join(' ') || "None" : "None";
  const githubUrl = packageJson && JSON.parse(packageJson).repository ? JSON.parse(packageJson).repository.url.split('+')[1] : `https://github.com/${pkg.url.split(':')[1]}`;

  return `
    <div class="result-item">
      <h3>${name}</h3>
        <div class="tags">${keywords}</div>
        <br />
        Github: <a href="${githubUrl}" target="_blank">${githubUrl}</a>
        <br />
      <h4>Description</h4>
      ${description}
      <br />
      <br />

        ${readme && readme !== '404: Not Found' ? `
          <details>
            <summary>README</summary>
            <div class="readme-content">${parseMarkdown(readme)}</div>
          </details>` : ""}
        <h4>Install:</h4>
        <div class="tabs">
          <button class="tab" onclick="showTab(this, 'rew-${name}')">Rew</button>
          <button class="tab" onclick="showTab(this, 'pimmy-${name}')">Pimmy</button>
          <button class="tab" onclick="showTab(this, 'github-${name}')">Github</button>
        </div>
        <div class="code-block" id="rew-${name}">$ rew install @${pkg.repo.name}/${name}</div>
        <div class="code-block" id="pimmy-${name}" style="display:none">$ pimmy -Sa ${pkg.repo.name}/${name}</div>
        <div class="code-block" id="github-${name}" style="display:none">$ rew install ${pkg.url}</div>
      </div>
    </div>
  `;
}

async function fetchAndStorePackages(name, url) {
  const json = await getRepoJson(url);
  const packages = [];
  if (json.packages) {
    for (let pkgName in json.packages) {
      const pkg = { name: pkgName, repo: { name, url }, url: json.packages[pkgName] };
      let match = json.packages[pkgName].match(/^github:([^\/]+)\/(.+)$/)
      const [, owner, repoName] = match;
      const filesToFetch = ['app.yaml', 'package.json', 'README.md'];
      for (let file of filesToFetch) {
        const fileUrl = `https://raw.githubusercontent.com/${owner}/${repoName}/main/${file}`;
        try{
          const content = await fetch(fileUrl).then(res => res.ok ? res.text() : null);
          if (content) {
            pkg[file] = content;
          }
        } catch(e) { continue; }
      }
      packages.push(pkg);
    }
  }
  await storePackages(packages);
}

document.addEventListener('DOMContentLoaded', () => {
  const results = document.getElementById('results');
  const syncButton = document.getElementById('sync-btn');
  const addButton = document.getElementById('add-btn');

  addButton.addEventListener('click', async (event) => {
    addPackage();
  });

  syncButton.addEventListener('click', async (event) => {
    showLoading();
    for (let i in packageList){
      await fetchAndStorePackages(i, packageList[i]);
    }
    hideLoading();
  });

  searchBar.addEventListener('input', async () => {
    const term = searchBar.value.toLowerCase().trim();
    if(!term.length) return results.innerHTML = '';
    const matches = await searchPackages(term);
    results.innerHTML = matches.map(pkg => createResultItem(pkg)).join('');
  });
});

function showTab(button, tabId) {
  const parent = button.closest('.result-item');
  parent.querySelectorAll('.tab').forEach(btn => btn.classList.remove('active'));
  parent.querySelectorAll('.code-block').forEach(block => block.style.display = 'none');
  button.classList.add('active');
  document.getElementById(tabId).style.display = 'block';
}


renderPackages();