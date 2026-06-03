// ==================== CONFIGURATION ====================
const CONFIG = {
  JIRA_DOMAIN: 'xxxx.atlassian.net',
  JIRA_EMAIL: 'sowrav.s.haldar@xxx',
  JIRA_API_TOKEN: 'ATATT3xFfGF0CKPX_fHQtS-ZSf3j1eZphwXXXXXXXXXXXXXXXXXBuOYDIxdgRjrMOucV7XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXgniwY=FBBFF1EB',
  SPREADSHEET_ID: '1nlxxxxxCdCdpxxxxq9jg',
  JIRA_STORY_POINTS_FIELD: 'customfield_10016',
  APPROVAL_EMAIL: 'sowrav.s.haldar@xxxxx'
};

// ==================== GUARD RAILS ====================
var GUARD = {
  MAX_EPICS: 50,
  MAX_STORIES_PER_EPIC: 30,
  MAX_SPRINTS: 26,
  VALID_SP: [1, 2, 3, 5, 8, 13, 21],
  VALID_TYPES: ['positive', 'negative', 'edge'],

  nearestFib: function (n) {
    return this.VALID_SP.reduce(function (p, c) {
      return Math.abs(c - n) < Math.abs(p - n) ? c : p;
    });
  },

  sanitize: function (str, max) {
    if (!str || typeof str !== 'string') return '';
    return str.substring(0, max || 500);
  },

  validateAndFix: function (plan) {
    if (!plan || typeof plan !== 'object') {
      return { issues: ['Invalid plan object'], plan: plan };
    }
    var issues = [];

    if (!Array.isArray(plan.epics)) { plan.epics = []; issues.push('Epics array was missing'); }
    if (plan.epics.length > GUARD.MAX_EPICS) { plan.epics = plan.epics.slice(0, GUARD.MAX_EPICS); issues.push('Epics truncated'); }

    plan.epics.forEach(function (epic, ei) {
      if (!epic.summary) { epic.summary = 'Epic ' + (ei + 1); issues.push('Epic ' + (ei + 1) + ' had no summary'); }
      if (!Array.isArray(epic.stories)) { epic.stories = []; issues.push('Epic ' + (ei + 1) + ' stories not array'); }
      if (epic.stories.length > GUARD.MAX_STORIES_PER_EPIC) {
        epic.stories = epic.stories.slice(0, GUARD.MAX_STORIES_PER_EPIC);
        issues.push('Epic ' + (ei + 1) + ' stories truncated');
      }
      epic.stories.forEach(function (story) {
        if (!story.summary) story.summary = 'Untitled Story';
        var sp = Number(story.storyPoints);
        if (!GUARD.VALID_SP.includes(sp)) { story.storyPoints = GUARD.nearestFib(sp || 3); issues.push('SP corrected'); }
        if (!Array.isArray(story.acceptanceCriteria)) story.acceptanceCriteria = [];
        if (!Array.isArray(story.subtasks)) story.subtasks = [];
        story.subtasks.forEach(function (sub) {
          var subSP = Number(sub.storyPoints);
          if (!GUARD.VALID_SP.includes(subSP)) sub.storyPoints = GUARD.nearestFib(subSP || 2);
        });
      });
    });

    if (!Array.isArray(plan.sprints)) { plan.sprints = []; issues.push('Sprints missing'); }
    if (plan.sprints.length > GUARD.MAX_SPRINTS) { plan.sprints = plan.sprints.slice(0, GUARD.MAX_SPRINTS); issues.push('Sprints truncated'); }

    if (!plan.raidLog) plan.raidLog = {};
    ['risks', 'assumptions', 'dependencies', 'issues'].forEach(function (k) {
      if (!Array.isArray(plan.raidLog[k])) plan.raidLog[k] = [];
    });

    if (!Array.isArray(plan.testCases)) plan.testCases = [];
    plan.testCases.forEach(function (tc) {
      if (!GUARD.VALID_TYPES.includes(tc.type)) tc.type = 'positive';
      if (!Array.isArray(tc.steps)) tc.steps = [];
    });

    return { issues: issues, plan: plan };
  },

  scrubP2: function (plan) {
    var p2 = [
      /\b[\w.+-]+@[\w-]+\.[\w.]+\b/g,
      /\b(?:\+?1[-.\s]?)?\(?\d{3}\)?[-.\s]\d{3}[-.\s]\d{4}\b/g,
      /\b(?:password|passwd|secret|token|api[-_]?key)\s*[:=]\s*\S+/gi
    ];
    function clean(s) {
      if (!s || typeof s !== 'string') return s;
      p2.forEach(function (re) { s = s.replace(re, '[REDACTED]'); });
      return s;
    }
    function deepClean(o) {
      if (!o || typeof o !== 'object') return o;
      Object.keys(o).forEach(function (k) {
        if (typeof o[k] === 'string') o[k] = clean(o[k]);
        else if (Array.isArray(o[k])) o[k].forEach(function (item, i) { o[k][i] = deepClean(item); });
        else if (typeof o[k] === 'object') deepClean(o[k]);
      });
      return o;
    }
    return deepClean(plan);
  }
};

function countTokens(t) { return t ? Math.ceil(t.length / 4) : 0; }

// ==================== ENTRY POINT ====================
function doGet() {
  return HtmlService.createHtmlOutputFromFile('UploadPage')
    .setTitle('BRD to Jira AI Engine v4')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

// ==================== API KEYS ====================
function saveApiKeys(key1, key2) {
  var p = PropertiesService.getUserProperties();
  if (key1 && key1.trim()) p.setProperty('GEMINI_API_KEY_1', key1.trim());
  if (key2 && key2.trim()) p.setProperty('GEMINI_API_KEY_2', key2.trim());
  return { success: true };
}

function getApiKeys() {
  var p = PropertiesService.getUserProperties();
  var k1 = p.getProperty('GEMINI_API_KEY_1') || '';
  var k2 = p.getProperty('GEMINI_API_KEY_2') || '';
  return {
    key1Saved: k1.length > 0,
    key2Saved: k2.length > 0,
    key1Hint: k1.length > 8 ? k1.substring(0, 6) + '...' + k1.slice(-4) : (k1 ? '...' : ''),
    key2Hint: k2.length > 8 ? k2.substring(0, 6) + '...' + k2.slice(-4) : (k2 ? '...' : '')
  };
}

// ==================== JIRA PROJECTS ====================
function getJiraProjects() {
  try {
    var auth = Utilities.base64Encode(CONFIG.JIRA_EMAIL + ':' + CONFIG.JIRA_API_TOKEN);
    var url = 'https://' + CONFIG.JIRA_DOMAIN + '/rest/api/3/project';
    var response = UrlFetchApp.fetch(url, {
      method: 'GET',
      headers: { Authorization: 'Basic ' + auth },
      muteHttpExceptions: true
    });
    if (response.getResponseCode() !== 200) throw new Error('Failed: ' + response.getContentText());
    return JSON.parse(response.getContentText()).map(function (p) {
      return { key: p.key, name: p.name, type: p.projectTypeKey };
    });
  } catch (err) {
    Logger.log('getJiraProjects: ' + err);
    return [];
  }
}

// ==================== EXISTING PLANS ====================
function getExistingPlans() {
  try {
    var ss = SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
    var sheet = ss.getSheetByName('ProjectPlans');
    if (!sheet) return [];
    var data = sheet.getDataRange().getValues();
    var plans = [];
    for (var i = 1; i < data.length; i++) {
      var row = data[i];
      if (row[0]) {
        plans.push({
          id: String(row[0]),
          label: String(row[0]).substring(0, 8) + '… — ' + new Date(row[1]).toLocaleDateString() + ' [' + row[3] + ']'
        });
      }
    }
    return plans.reverse();
  } catch (e) {
    Logger.log('getExistingPlans: ' + e);
    return [];
  }
}

function loadExistingPlan(planId) {
  try {
    var ss = SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
    var sheet = ss.getSheetByName('ProjectPlans');
    if (!sheet) return { success: false, error: 'ProjectPlans sheet not found' };
    var row = findPlanRow(sheet, planId);
    if (!row) return { success: false, error: 'Plan not found: ' + planId };
    var planJson = sheet.getRange(row, 3).getValue();
    if (!planJson) return { success: false, error: 'Plan data empty' };
    var plan = JSON.parse(planJson);
    var guardResult = GUARD.validateAndFix(plan);
    return { success: true, planId: planId, plan: guardResult.plan };
  } catch (e) {
    return { success: false, error: e.toString() };
  }
}

// ==================== BRD PROCESSING ====================
function processBRD(base64String, fileName, mimeType, startDate, endDate) {
  try {
    var props = PropertiesService.getUserProperties();
    var apiKey1 = props.getProperty('GEMINI_API_KEY_1');
    var apiKey2 = props.getProperty('GEMINI_API_KEY_2');
    if (!apiKey1 || !apiKey2) return { success: false, error: 'Please set both Gemini API keys first.' };

    var blob = Utilities.newBlob(Utilities.base64Decode(base64String), mimeType, fileName);
    var brdText = extractTextFromDocx(blob);
    if (!brdText || brdText.trim().length < 50) return { success: false, error: 'Could not extract text from document.' };

    var planResult = callGeminiForPlan(brdText, apiKey1, startDate, endDate);
    if (planResult.error) return { success: false, error: 'Plan generation failed: ' + planResult.error };

    var projectPlan = planResult.data;
    if (!projectPlan.epics || !Array.isArray(projectPlan.epics)) return { success: false, error: 'AI returned invalid plan structure.' };

    var testResult = callGeminiForTestCases(projectPlan, apiKey2);
    projectPlan.testCases = testResult.error ? [] : (testResult.data || []);
    projectPlan.sprints = projectPlan.sprints || [];
    projectPlan.raidLog = projectPlan.raidLog || { risks: [], assumptions: [], dependencies: [], issues: [] };
    ['risks', 'assumptions', 'dependencies', 'issues'].forEach(function (k) { projectPlan.raidLog[k] = projectPlan.raidLog[k] || []; });

    var gr = GUARD.validateAndFix(projectPlan);
    projectPlan = GUARD.scrubP2(gr.plan);
    var planId = storePlanInSheet(projectPlan);
    return { success: true, planId: planId, reviewSheetUrl: getReviewSheetUrl(planId), plan: projectPlan, guardIssues: gr.issues };
  } catch (error) {
    Logger.log('processBRD: ' + error);
    return { success: false, error: error.toString() };
  }
}

// ==================== SOW+ARB PROCESSING ====================
function processSOWandARB(b64SOW, sowFileName, b64ARB, arbFileName, startDate, endDate) {
  try {
    var props = PropertiesService.getUserProperties();
    var apiKey1 = props.getProperty('GEMINI_API_KEY_1');
    var apiKey2 = props.getProperty('GEMINI_API_KEY_2');
    if (!apiKey1 || !apiKey2) return { success: false, error: 'Please set both Gemini API keys first.' };

    var sowBlob = Utilities.newBlob(Utilities.base64Decode(b64SOW), 'application/pdf', sowFileName);
    var sowText = extractTextFromPdf(sowBlob);
    if (!sowText || sowText.trim().length < 50) return { success: false, error: 'Could not extract text from SOW PDF.' };

    var arbBlob = Utilities.newBlob(Utilities.base64Decode(b64ARB), 'application/pdf', arbFileName);
    var arbText = extractTextFromPdf(arbBlob);
    if (!arbText || arbText.trim().length < 50) return { success: false, error: 'Could not extract text from ARB PDF.' };

    var combinedText = 'SOW:\n' + sowText + '\n\n---\n\nARB:\n' + arbText;
    var planResult = callGeminiForSOWARBPlan(combinedText, apiKey1, startDate, endDate);
    if (planResult.error) return { success: false, error: 'Plan generation failed: ' + planResult.error };

    var projectPlan = planResult.data;
    if (!projectPlan.epics || !Array.isArray(projectPlan.epics)) return { success: false, error: 'AI returned invalid plan structure.' };

    var testResult = callGeminiForTestCases(projectPlan, apiKey2);
    projectPlan.testCases = testResult.error ? [] : (testResult.data || []);
    projectPlan.sprints = projectPlan.sprints || [];
    projectPlan.raidLog = projectPlan.raidLog || { risks: [], assumptions: [], dependencies: [], issues: [] };
    ['risks', 'assumptions', 'dependencies', 'issues'].forEach(function (k) { projectPlan.raidLog[k] = projectPlan.raidLog[k] || []; });

    var gr = GUARD.validateAndFix(projectPlan);
    projectPlan = GUARD.scrubP2(gr.plan);
    var planId = storePlanInSheet(projectPlan);
    return { success: true, planId: planId, reviewSheetUrl: getReviewSheetUrl(planId), plan: projectPlan, guardIssues: gr.issues };
  } catch (error) {
    Logger.log('processSOWandARB: ' + error);
    return { success: false, error: error.toString() };
  }
}

// ==================== REGENERATE WITH COMMENTS ====================
function reGeneratePlanWithComments(planId, reviewComments) {
  try {
    var ss = SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
    var plansSheet = ss.getSheetByName('ProjectPlans');
    if (!plansSheet) return { success: false, error: 'ProjectPlans sheet not found' };

    var planRow = findPlanRow(plansSheet, planId);
    if (!planRow) return { success: false, error: 'Plan not found' };

    var planJson = plansSheet.getRange(planRow, 3).getValue();
    var existingPlan = JSON.parse(planJson);

    var props = PropertiesService.getUserProperties();
    var apiKey1 = props.getProperty('GEMINI_API_KEY_1');
    var apiKey2 = props.getProperty('GEMINI_API_KEY_2');
    if (!apiKey1 || !apiKey2) return { success: false, error: 'Gemini API keys not set' };

    var revisionPrompt = buildRevisionPrompt(existingPlan, reviewComments);
    var response = callGeminiAPIWithRetry(revisionPrompt, apiKey1);
    if (response.error) return { success: false, error: 'Revision failed: ' + response.error };

    var rawText = response.candidates[0].content.parts[0].text;
    var cleanJson = rawText.replace(/^```json\s*/, '').replace(/^```\s*/, '').replace(/```\s*$/, '').trim();
    logAPIConsumption(apiKey1, 'revision', revisionPrompt, response);

    var revisedPlan = JSON.parse(cleanJson);
    var testResult = callGeminiForTestCases(revisedPlan, apiKey2);
    revisedPlan.testCases = testResult.error ? [] : (testResult.data || []);
    revisedPlan.sprints = revisedPlan.sprints || existingPlan.sprints || [];
    revisedPlan.raidLog = revisedPlan.raidLog || existingPlan.raidLog || { risks: [], assumptions: [], dependencies: [], issues: [] };
    ['risks', 'assumptions', 'dependencies', 'issues'].forEach(function (k) { revisedPlan.raidLog[k] = revisedPlan.raidLog[k] || []; });

    var gr = GUARD.validateAndFix(revisedPlan);
    revisedPlan = GUARD.scrubP2(gr.plan);

    plansSheet.getRange(planRow, 6).setValue('Revision requested: ' + reviewComments.substring(0, 200));
    var newPlanId = storePlanInSheet(revisedPlan);
    return { success: true, planId: newPlanId, plan: revisedPlan };
  } catch (e) {
    Logger.log('reGeneratePlanWithComments: ' + e);
    return { success: false, error: e.toString() };
  }
}

function buildRevisionPrompt(existingPlan, reviewComments) {
  return 'You are a Snowflake Solution Architect and Senior Project Manager.\n' +
    'The following project plan has been reviewed and the reviewer has requested changes.\n\n' +
    'REVIEWER COMMENTS:\n' + reviewComments + '\n\n' +
    'EXISTING PLAN (summarized):\n' +
    JSON.stringify({
      epics: existingPlan.epics.map(function (e) {
        return { summary: e.summary, stories: e.stories.map(function (s) { return { summary: s.summary, storyPoints: s.storyPoints }; }) };
      })
    }, null, 1).substring(0, 8000) + '\n\n' +
    'Please revise the plan addressing the reviewer comments. Return ONLY valid JSON (no markdown):\n' +
    '{"epics":[{"summary":"string","description":"string","stories":[{"summary":"string","description":"As a ... I want ... so that ...","acceptanceCriteria":["string"],"storyPoints":5,"subtasks":[{"summary":"string","description":"string","storyPoints":2}]}]}],' +
    '"sprints":[{"sprintNumber":1,"startDate":"YYYY-MM-DD","endDate":"YYYY-MM-DD","goal":"string","storyKeys":["story summary"],"totalStoryPoints":20}],' +
    '"raidLog":{"risks":[{"description":"string","mitigation":"string"}],"assumptions":["string"],"dependencies":[{"description":"string","owner":"string"}],"issues":[]}}';
}

// ==================== SEND APPROVAL EMAIL ====================
function sendApprovalEmail(planId) {
  try {
    var ss = SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
    var plansSheet = ss.getSheetByName('ProjectPlans');
    if (!plansSheet) return;
    var planRow = findPlanRow(plansSheet, planId);
    if (!planRow) return;
    var planJson = plansSheet.getRange(planRow, 3).getValue();
    var plan = JSON.parse(planJson);
    var epics = plan.epics || [];
    var sprints = plan.sprints || [];
    var totalSP = epics.reduce(function (a, e) { return a + (e.stories || []).reduce(function (b, s) { return b + (s.storyPoints || 0); }, 0); }, 0);
    var reviewUrl = getReviewSheetUrl(planId);

    var subject = '[BRD-AI Engine] New Project Plan Ready for Approval — ID: ' + planId.substring(0, 8);
    var body = 'Hello,\n\n' +
      'A new AI-generated project plan is ready for your review and approval.\n\n' +
      'Plan ID: ' + planId + '\n' +
      'Generated: ' + new Date().toLocaleString() + '\n' +
      'Epics: ' + epics.length + '\n' +
      'Stories: ' + epics.reduce(function (a, e) { return a + (e.stories || []).length; }, 0) + '\n' +
      'Total Story Points: ' + totalSP + '\n' +
      'Sprints: ' + sprints.length + '\n' +
      'Test Cases: ' + (plan.testCases || []).length + '\n\n' +
      (reviewUrl ? 'Review Dashboard: ' + reviewUrl + '\n\n' : '') +
      'Best regards,\nBRD-AI Engine v4.0';

    MailApp.sendEmail({ to: CONFIG.APPROVAL_EMAIL, subject: subject, body: body });
  } catch (e) {
    Logger.log('sendApprovalEmail error: ' + e);
  }
}

// ==================== TEXT EXTRACTION ====================
function extractTextFromPdf(pdfBlob) {
  var tempFile = DriveApp.createFile(pdfBlob);
  var fileId = tempFile.getId();
  var docFile = null;
  for (var attempt = 1; attempt <= 3; attempt++) {
    try {
      var resource = { title: pdfBlob.getName().replace(/\.pdf$/i, '') + '_extracted', mimeType: MimeType.GOOGLE_DOCS };
      docFile = Drive.Files.copy(resource, fileId);
      break;
    } catch (e) {
      if (attempt === 3) { try { DriveApp.getFileById(fileId).setTrashed(true); } catch (ex) { } throw new Error('Failed PDF convert: ' + e.message); }
      Utilities.sleep(1500 * attempt);
    }
  }
  try { var doc = DocumentApp.openById(docFile.id); return doc.getBody().getText(); }
  finally {
    try { DriveApp.getFileById(fileId).setTrashed(true); } catch (e) { }
    try { Drive.Files.remove(docFile.id); } catch (e) { }
  }
}

function extractTextFromDocx(fileBlob) {
  var tempFile = DriveApp.createFile(fileBlob);
  var docId = tempFile.getId();
  var docFile = null;
  for (var attempt = 1; attempt <= 3; attempt++) {
    try {
      docFile = Drive.Files.copy({ title: tempFile.getName().replace(/\.docx$/i, '') + '_tmp', mimeType: MimeType.GOOGLE_DOCS }, docId);
      break;
    } catch (e) {
      if (attempt === 3) { DriveApp.getFileById(docId).setTrashed(true); throw new Error('Failed DOCX convert: ' + e.message); }
      Utilities.sleep(1500 * attempt);
    }
  }
  try { var doc = DocumentApp.openById(docFile.id); return doc.getBody().getText(); }
  finally {
    try { DriveApp.getFileById(docId).setTrashed(true); } catch (e) { }
    try { Drive.Files.remove(docFile.id); } catch (e) { }
  }
}

// ==================== GEMINI API ====================
function callGeminiForPlan(brdText, apiKey, startDate, endDate) {
  var prompt = buildPlanPrompt(brdText, startDate, endDate);
  var response = callGeminiAPIWithRetry(prompt, apiKey);
  if (response.error) return { error: response.error };
  try {
    var rawText = response.candidates[0].content.parts[0].text;
    var cleanJson = rawText.replace(/^```json\s*/, '').replace(/^```\s*/, '').replace(/```\s*$/, '').trim();
    logAPIConsumption(apiKey, 'plan', prompt, response);
    return { data: JSON.parse(cleanJson) };
  } catch (e) { return { error: 'Failed to parse plan JSON: ' + e.message }; }
}

function callGeminiForSOWARBPlan(combinedText, apiKey, startDate, endDate) {
  var prompt = buildSOWARBPlanPrompt(combinedText, startDate, endDate);
  var response = callGeminiAPIWithRetry(prompt, apiKey);
  if (response.error) return { error: response.error };
  try {
    var rawText = response.candidates[0].content.parts[0].text;
    var cleanJson = rawText.replace(/^```json\s*/, '').replace(/^```\s*/, '').replace(/```\s*$/, '').trim();
    logAPIConsumption(apiKey, 'plan', prompt, response);
    return { data: JSON.parse(cleanJson) };
  } catch (e) { return { error: 'Failed to parse plan JSON: ' + e.message }; }
}

function callGeminiForTestCases(projectPlan, apiKey) {
  var slimPlan = {
    epics: projectPlan.epics.map(function (e) {
      return { summary: e.summary, stories: e.stories.map(function (s) { return { summary: s.summary, description: s.description, acceptanceCriteria: s.acceptanceCriteria }; }) };
    })
  };
  var prompt = buildTestCasesPrompt(slimPlan);
  var response = callGeminiAPIWithRetry(prompt, apiKey);
  if (response.error) return { error: response.error };
  try {
    var rawText = response.candidates[0].content.parts[0].text;
    var cleanJson = rawText.replace(/^```json\s*/, '').replace(/^```\s*/, '').replace(/```\s*$/, '').trim();
    logAPIConsumption(apiKey, 'tests', prompt, response);
    var data = JSON.parse(cleanJson);
    return { data: Array.isArray(data) ? data : [] };
  } catch (e) { return { error: 'Failed to parse test cases: ' + e.message }; }
}

function callGeminiAPIWithRetry(prompt, apiKey, retries) {
  retries = retries || 3;
  for (var attempt = 1; attempt <= retries; attempt++) {
    var result = callGeminiAPI(prompt, apiKey);
    if (!result.error) return result;
    var msg = result.error.toLowerCase();
    var retryable = msg.indexOf('429') !== -1 || msg.indexOf('503') !== -1 || msg.indexOf('unavailable') !== -1;
    if (!retryable || attempt === retries) return result;
    Utilities.sleep(Math.pow(2, attempt) * 1500);
  }
  return { error: 'Max retries exceeded' };
}

function callGeminiAPI(prompt, apiKey) {
  var url = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-3-flash-preview:generateContent?key=' + apiKey;
  var payload = {
    contents: [{ parts: [{ text: prompt }] }],
    generationConfig: { temperature: 0.2, responseMimeType: 'application/json', maxOutputTokens: 8192 }
  };
  try {
    var response = UrlFetchApp.fetch(url, {
      method: 'POST', contentType: 'application/json',
      payload: JSON.stringify(payload), muteHttpExceptions: true
    });
    var code = response.getResponseCode();
    var result = JSON.parse(response.getContentText());
    if (result.error) return { error: 'Gemini error (' + code + '): ' + result.error.message };
    if (!result.candidates || !result.candidates.length) return { error: 'No candidates. Code: ' + code };
    return result;
  } catch (e) { return { error: 'Network/parse error: ' + e.message }; }
}

function buildPlanPrompt(brdText, startDate, endDate) {
  var start = new Date(startDate), end = new Date(endDate);
  var diffWeeks = Math.max(1, Math.ceil((end - start) / (7 * 24 * 60 * 60 * 1000)));
  var suggestedSprints = Math.max(1, Math.ceil(diffWeeks / 3));
  return 'You are a Snowflake Solution Architect and Snowflake Data Scientist.\n' +
    'Analyse the BRD and generate a complete project plan as valid JSON ONLY (no markdown).\n' +
    'Project: ' + startDate + ' to ' + endDate + ' (' + diffWeeks + ' weeks, ' + suggestedSprints + ' sprints of ~3 weeks).\n' +
    'Last sprint: testing and sign-off. Use Fibonacci story points (1,2,3,5,8,13). DO NOT include personal data.\n' +
    'BRD (first 20000 chars):\n' + brdText.substring(0, 20000) + '\n' +
    'Return ONLY:\n' +
    '{"epics":[{"summary":"string","description":"string","stories":[{"summary":"string","description":"As a ... I want ... so that ...","acceptanceCriteria":["string"],"storyPoints":5,"subtasks":[{"summary":"string","description":"string","storyPoints":2}]}]}],' +
    '"sprints":[{"sprintNumber":1,"startDate":"YYYY-MM-DD","endDate":"YYYY-MM-DD","goal":"string","storyKeys":["story summary 1"],"totalStoryPoints":20}],' +
    '"raidLog":{"risks":[{"description":"string","mitigation":"string"}],"assumptions":["string"],"dependencies":[{"description":"string","owner":"string"}],"issues":[]}}';
}

function buildSOWARBPlanPrompt(combinedText, startDate, endDate) {
  var start = new Date(startDate), end = new Date(endDate);
  var diffWeeks = Math.max(1, Math.ceil((end - start) / (7 * 24 * 60 * 60 * 1000)));
  var suggestedSprints = Math.max(1, Math.ceil(diffWeeks / 3));
  return 'You are a Snowflake Solution Architect acting as Senior Project Manager.\n' +
    'Analyse both SOW and ARB documents. Generate a complete Jira-ready project plan as valid JSON ONLY.\n' +
    'Project: ' + startDate + ' to ' + endDate + ' (' + diffWeeks + ' weeks, ~' + suggestedSprints + ' sprints). Use Fibonacci SP (1,2,3,5,8,13). DO NOT include personal data.\n' +
    'Documents (first 28000 chars):\n' + combinedText.substring(0, 28000) + '\n' +
    'Return ONLY:\n' +
    '{"epics":[{"summary":"string","description":"string","stories":[{"summary":"string","description":"As a ... I want ... so that ...","acceptanceCriteria":["string"],"storyPoints":5,"subtasks":[{"summary":"string","description":"string","storyPoints":2}]}]}],' +
    '"sprints":[{"sprintNumber":1,"startDate":"YYYY-MM-DD","endDate":"YYYY-MM-DD","goal":"string","storyKeys":["story summary"],"totalStoryPoints":20}],' +
    '"raidLog":{"risks":[{"description":"string","mitigation":"string"}],"assumptions":["string"],"dependencies":[{"description":"string","owner":"string"}],"issues":[]}}';
}

function buildTestCasesPrompt(projectPlan) {
  return 'You are a QA Expert. Generate test cases for the plan below. Return ONLY valid JSON array (no markdown). DO NOT include personal data.\n' +
    'Plan: ' + JSON.stringify(projectPlan, null, 1).substring(0, 15000) + '\n' +
    'Return ONLY: [{"title":"string","precondition":"string","steps":["string"],"expectedResult":"string","type":"positive"}]\n' +
    'Types: positive, negative, or edge ONLY.';
}

function logAPIConsumption(apiKey, callType, prompt, result) {
  try {
    if (!result || !result.candidates) return;
    var promptTokens = countTokens(prompt);
    var responseTokens = countTokens(result.candidates[0].content.parts[0].text);
    var ss = SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
    var usageSheet = ss.getSheetByName('API_Usage');
    if (!usageSheet) {
      usageSheet = ss.insertSheet('API_Usage');
      usageSheet.getRange(1, 1, 1, 5).setValues([['Timestamp', 'Call Type', 'Prompt Tokens', 'Response Tokens', 'Total Tokens']]);
    }
    usageSheet.appendRow([new Date(), callType, promptTokens, responseTokens, promptTokens + responseTokens]);
    var prop = PropertiesService.getScriptProperties();
    var key = 'total_tokens_' + callType;
    prop.setProperty(key, String(parseInt(prop.getProperty(key) || '0') + promptTokens + responseTokens));
  } catch (e) { Logger.log('logAPIConsumption: ' + e.message); }
}

function getAPIUsage() {
  var prop = PropertiesService.getScriptProperties();
  return {
    apiKey1: { totalTokens: parseInt(prop.getProperty('total_tokens_plan') || '0') },
    apiKey2: { totalTokens: parseInt(prop.getProperty('total_tokens_tests') || '0') }
  };
}

// ==================== SHEET STORAGE ====================
function storePlanInSheet(projectPlan) {
  var ss = SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
  var plansSheet = ss.getSheetByName('ProjectPlans');
  if (!plansSheet) {
    plansSheet = ss.insertSheet('ProjectPlans');
    plansSheet.getRange(1, 1, 1, 8).setValues([['PlanID', 'Timestamp', 'PlanJSON', 'L1Status', 'L2Status', 'L1Comments', 'L2Comments', 'JiraStatus']]);
    plansSheet.getRange(1, 1, 1, 8).setFontWeight('bold').setBackground('#0F172A').setFontColor('#ffffff');
  }
  var planId = Utilities.getUuid();
  var planJson = JSON.stringify(projectPlan);
  if (planJson.length > 45000) {
    var slim = JSON.parse(planJson);
    slim.testCases = (slim.testCases || []).slice(0, 20);
    planJson = JSON.stringify(slim);
  }
  plansSheet.appendRow([planId, new Date().toISOString(), planJson, 'Pending', 'Pending', '', '', 'Not Pushed']);
  createReviewDashboard(ss, planId, projectPlan);
  return planId;
}

function createReviewDashboard(ss, planId, projectPlan) {
  var sheetName = 'Review_' + planId.substring(0, 8);
  var dashboard = ss.getSheetByName(sheetName);
  if (dashboard) ss.deleteSheet(dashboard);
  dashboard = ss.insertSheet(sheetName);

  dashboard.getRange('H1').setValue(planId);
  dashboard.hideColumns(8);

  dashboard.getRange('A1:G1').merge().setValue('PROJECT PLAN REVIEW DASHBOARD')
    .setBackground('#0F172A').setFontColor('#ffffff').setFontSize(16).setFontWeight('bold').setVerticalAlignment('middle');
  dashboard.setRowHeight(1, 52);
  dashboard.getRange('A2:G2').merge().setValue('Plan ID: ' + planId + ' | Generated: ' + new Date().toLocaleString())
    .setBackground('#3B6BE8').setFontColor('#ffffff').setFontSize(10).setVerticalAlignment('middle');
  dashboard.setRowHeight(2, 28);

  var row = 4;
  dashboard.getRange(row, 1, 1, 7).merge().setValue('EPICS OVERVIEW')
    .setBackground('#0F172A').setFontColor('#ffffff').setFontWeight('bold').setFontSize(11);
  row++;

  var epicColors = ['#3b6be8', '#0e9488', '#7c3aed', '#d97706', '#059669', '#dc2626'];
  (projectPlan.epics || []).forEach(function (e, i) {
    var sp = (e.stories || []).reduce(function (a, s) { return a + (s.storyPoints || 0); }, 0);
    var ec = epicColors[i % epicColors.length];
    dashboard.setRowHeight(row, 24);
    dashboard.getRange(row, 1).setValue(i + 1).setBackground(ec).setFontColor('#ffffff').setFontWeight('bold').setHorizontalAlignment('center');
    dashboard.getRange(row, 2, 1, 3).merge().setValue(e.summary).setBackground(i % 2 === 0 ? '#EEF3FD' : '#f9fafb').setFontWeight('bold');
    dashboard.getRange(row, 5).setValue(e.stories.length + ' stories').setBackground(i % 2 === 0 ? '#EEF3FD' : '#f9fafb').setHorizontalAlignment('center');
    dashboard.getRange(row, 6).setValue(sp + ' pts').setBackground(ec).setFontColor('#ffffff').setHorizontalAlignment('center').setFontWeight('bold');
    dashboard.getRange(row, 7).setBackground(ec);
    row++;
  });

  row++;
  function addApprovalBlock(startRow, level, title) {
    dashboard.getRange(startRow, 1, 1, 7).merge().setValue(level + ' - ' + title)
      .setBackground('#3B6BE8').setFontColor('#ffffff').setFontWeight('bold').setFontSize(11);
    dashboard.setRowHeight(startRow, 28);
    dashboard.setRowHeight(startRow + 1, 24);
    dashboard.getRange(startRow + 1, 1).setValue('Status').setFontWeight('bold').setBackground('#f0f4f8');
    dashboard.getRange(startRow + 1, 2).setValue('Pending')
      .setDataValidation(SpreadsheetApp.newDataValidation().requireValueInList(['Pending', 'Approved', 'Rejected'], true).build())
      .setBackground('#fffbeb').setFontWeight('bold');
    dashboard.getRange(startRow + 1, 3, 1, 5).merge().setBackground('#f0f4f8');
    dashboard.setRowHeight(startRow + 2, 56);
    dashboard.getRange(startRow + 2, 1).setValue('Comments').setFontWeight('bold').setBackground('#f0f4f8').setVerticalAlignment('top');
    dashboard.getRange(startRow + 2, 2, 1, 6).merge().setValue('')
      .setBackground('#ffffff').setWrap(true).setVerticalAlignment('top')
      .setBorder(true, true, true, true, false, false, '#cbd5e0', SpreadsheetApp.BorderStyle.SOLID);
  }

  addApprovalBlock(row, 'LEVEL 1 REVIEW', 'Project Manager'); row += 4;
  addApprovalBlock(row, 'LEVEL 2 REVIEW', 'Solution Architect'); row += 4;

  dashboard.getRange(row, 1, 1, 3).merge().setValue('JIRA PUSH STATUS')
    .setBackground('#0F172A').setFontColor('#ffffff').setFontWeight('bold');
  dashboard.getRange(row, 4, 1, 4).merge().setValue('Not yet pushed')
    .setBackground('#f0f4f8').setHorizontalAlignment('center');

  [160, 200, 80, 80, 100, 100, 60].forEach(function (w, i) { dashboard.setColumnWidth(i + 1, w); });
}

function findPlanRow(sheet, planId) {
  var data = sheet.getDataRange().getValues();
  for (var i = 1; i < data.length; i++) {
    if (String(data[i][0]).trim() === String(planId).trim()) return i + 1;
  }
  return null;
}

function getSheetIdByName(sheetName) {
  try {
    var sheet = SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID).getSheetByName(sheetName);
    return sheet ? sheet.getSheetId() : null;
  } catch (e) { return null; }
}

function getReviewSheetUrl(planId) {
  var shortName = 'Review_' + planId.substring(0, 8);
  var sheetId = getSheetIdByName(shortName);
  return sheetId !== null
    ? 'https://docs.google.com/spreadsheets/d/' + CONFIG.SPREADSHEET_ID + '/edit#gid=' + sheetId
    : '';
}

// ==================== ON EDIT TRIGGER ====================
function onEdit(e) {
  try {
    var sheet = e.source.getActiveSheet();
    if (!sheet.getName().startsWith('Review_')) return;
    var planId = sheet.getRange('H1').getValue();
    if (!planId) return;

    var data = sheet.getDataRange().getValues();
    var l1Status = '', l2Status = '', l1Comments = '', l2Comments = '';
    var statusCount = 0, commentCount = 0;

    for (var i = 0; i < data.length; i++) {
      if (data[i][0] === 'Status') {
        statusCount++;
        if (statusCount === 1) l1Status = data[i][1];
        else l2Status = data[i][1];
      }
      if (data[i][0] === 'Comments') {
        commentCount++;
        if (commentCount === 1) l1Comments = data[i][1];
        else l2Comments = data[i][1];
      }
    }

    var mainSheet = SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID).getSheetByName('ProjectPlans');
    if (!mainSheet) return;
    var planRow = findPlanRow(mainSheet, planId);
    if (planRow) {
      mainSheet.getRange(planRow, 4).setValue(l1Status);
      mainSheet.getRange(planRow, 5).setValue(l2Status);
      mainSheet.getRange(planRow, 6).setValue(l1Comments);
      mainSheet.getRange(planRow, 7).setValue(l2Comments);
    }
    if (l1Status === 'Approved' && l2Status === 'Approved') {
      sendApprovalConfirmationEmail(planId, l1Comments, l2Comments);
    }
  } catch (e) { Logger.log('onEdit: ' + e.message); }
}

function sendApprovalConfirmationEmail(planId, l1Comments, l2Comments) {
  try {
    var subject = '[BRD-AI Engine] Plan Approved — ID: ' + planId.substring(0, 8);
    var body = 'The project plan has received dual approval and is ready to push to Jira.\n\n' +
      'Plan ID: ' + planId + '\n\n' +
      'Level 1 Comments: ' + (l1Comments || 'None') + '\n' +
      'Level 2 Comments: ' + (l2Comments || 'None') + '\n\n' +
      'Best regards,\nBRD-AI Engine v4.0';
    MailApp.sendEmail({ to: CONFIG.APPROVAL_EMAIL, subject: subject, body: body });
  } catch (e) { Logger.log('sendApprovalConfirmationEmail: ' + e); }
}

// ==================== JIRA PUSH ====================
function pushToJiraFromUI(planId, projectKey, l1Status, l1Comments, l2Status, l2Comments) {
  try {
    if (!projectKey) throw new Error('No Jira project selected.');
    var ss = SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
    var plansSheet = ss.getSheetByName('ProjectPlans');
    if (!plansSheet) throw new Error('ProjectPlans sheet not found');
    var planRow = findPlanRow(plansSheet, planId);
    if (!planRow) throw new Error('Plan not found');

    var projectPlan = JSON.parse(plansSheet.getRange(planRow, 3).getValue());
    if (!projectPlan.epics || !projectPlan.epics.length) throw new Error('Plan has no epics.');

    plansSheet.getRange(planRow, 4).setValue(l1Status);
    plansSheet.getRange(planRow, 5).setValue(l2Status);
    plansSheet.getRange(planRow, 6).setValue(l1Comments);
    plansSheet.getRange(planRow, 7).setValue(l2Comments);

    var result = callJiraCreateIssues(projectPlan, projectKey);
    plansSheet.getRange(planRow, 8).setValue('Pushed to Jira on ' + new Date().toLocaleString());
    return { success: true, epicKeys: result.epicKeys };
  } catch (err) {
    Logger.log('pushToJiraFromUI: ' + err);
    return { success: false, error: err.toString() };
  }
}

function callJiraCreateIssues(projectPlan, projectKey) {
  var baseUrl = 'https://' + CONFIG.JIRA_DOMAIN + '/rest/api/3';
  var auth = Utilities.base64Encode(CONFIG.JIRA_EMAIL + ':' + CONFIG.JIRA_API_TOKEN);
  var issueTypes = getIssueTypesForProject(projectKey);
  var epicKeys = [];

  (projectPlan.epics || []).forEach(function (epic) {
    var epicRes = jiraRequest(baseUrl + '/issue', 'POST', {
      fields: {
        project: { key: projectKey },
        issuetype: { name: issueTypes.Epic },
        summary: epic.summary,
        description: makeADF(epic.description || '')
      }
    }, auth);
    var epicKey = epicRes.key;
    epicKeys.push(epicKey);

    (epic.stories || []).forEach(function (story) {
      var acText = (story.acceptanceCriteria || []).map(function (a, i) { return (i + 1) + '. ' + a; }).join('\n');
      var storyFields = {
        project: { key: projectKey },
        issuetype: { name: issueTypes.Story },
        summary: story.summary,
        description: makeADF((story.description || '') + '\n\nAcceptance Criteria:\n' + acText),
        parent: { key: epicKey }
      };
      if (story.storyPoints && CONFIG.JIRA_STORY_POINTS_FIELD) storyFields[CONFIG.JIRA_STORY_POINTS_FIELD] = story.storyPoints;
      var storyRes = jiraRequest(baseUrl + '/issue', 'POST', { fields: storyFields }, auth);
      var storyKey = storyRes.key;

      (story.subtasks || []).forEach(function (subtask) {
        var subFields = {
          project: { key: projectKey },
          issuetype: { name: issueTypes.Subtask },
          summary: subtask.summary,
          description: makeADF(subtask.description || ''),
          parent: { key: storyKey }
        };
        if (subtask.storyPoints && CONFIG.JIRA_STORY_POINTS_FIELD) subFields[CONFIG.JIRA_STORY_POINTS_FIELD] = subtask.storyPoints;
        jiraRequest(baseUrl + '/issue', 'POST', { fields: subFields }, auth);
      });
    });
  });

  jiraRequest(baseUrl + '/issue', 'POST', {
    fields: {
      project: { key: projectKey },
      issuetype: { name: issueTypes.Task },
      summary: 'RAID Log - AI Generated',
      description: makeADF(formatRaidDescription(projectPlan.raidLog))
    }
  }, auth);

  (projectPlan.testCases || []).forEach(function (tc) {
    var stepsText = (tc.steps || []).map(function (s, i) { return (i + 1) + '. ' + s; }).join('\n');
    jiraRequest(baseUrl + '/issue', 'POST', {
      fields: {
        project: { key: projectKey },
        issuetype: { name: issueTypes.Task },
        summary: '[' + ((tc.type || '').toUpperCase()) + '] Test: ' + tc.title,
        description: makeADF(
          'Precondition: ' + (tc.precondition || '') +
          '\n\nSteps:\n' + stepsText +
          '\n\nExpected Result: ' + (tc.expectedResult || '')
        )
      }
    }, auth);
  });

  return { epicKeys: epicKeys };
}

function getIssueTypesForProject(projectKey) {
  var auth = Utilities.base64Encode(CONFIG.JIRA_EMAIL + ':' + CONFIG.JIRA_API_TOKEN);
  var url = 'https://' + CONFIG.JIRA_DOMAIN + '/rest/api/3/issue/createmeta?projectKeys=' + projectKey + '&expand=projects.issuetypes';
  var response = UrlFetchApp.fetch(url, { method: 'GET', headers: { Authorization: 'Basic ' + auth }, muteHttpExceptions: true });
  if (response.getResponseCode() !== 200) throw new Error('Failed to fetch issue types: ' + response.getContentText());

  var data = JSON.parse(response.getContentText());
  var projectMeta = null;
  for (var i = 0; i < data.projects.length; i++) {
    if (data.projects[i].key === projectKey) { projectMeta = data.projects[i]; break; }
  }
  if (!projectMeta) throw new Error('Project ' + projectKey + ' not found');

  var typeMap = { Epic: null, Story: null, Subtask: null, Task: null };
  for (var j = 0; j < projectMeta.issuetypes.length; j++) {
    var it = projectMeta.issuetypes[j];
    if (it.name === 'Epic') typeMap.Epic = it.name;
    else if (it.name === 'Story') typeMap.Story = it.name;
    else if (it.name === 'Subtask' || it.name === 'Sub-task') typeMap.Subtask = it.name;
    else if (it.name === 'Task') typeMap.Task = it.name;
  }
  var missing = [];
  for (var k in typeMap) { if (!typeMap[k]) missing.push(k); }
  if (missing.length) throw new Error('Project ' + projectKey + ' missing issue types: ' + missing.join(', '));
  return typeMap;
}

function makeADF(text) {
  return {
    type: 'doc', version: 1,
    content: (text || '').split('\n\n').filter(function (p) { return p.trim(); }).map(function (para) {
      return { type: 'paragraph', content: [{ type: 'text', text: para.trim() }] };
    })
  };
}

function jiraRequest(url, method, payload, auth) {
  var response = UrlFetchApp.fetch(url, {
    method: method,
    headers: { Authorization: 'Basic ' + auth, 'Content-Type': 'application/json', Accept: 'application/json' },
    payload: JSON.stringify(payload),
    muteHttpExceptions: true
  });
  var code = response.getResponseCode();
  var text = response.getContentText();
  if (code < 200 || code >= 300) throw new Error('Jira error ' + code + ': ' + text.substring(0, 500));
  return JSON.parse(text);
}

function formatRaidDescription(raid) {
  if (!raid) return 'No RAID data.';
  var text = 'RISKS:\n';
  (raid.risks || []).forEach(function (r) { text += '- ' + r.description + '\n  Mitigation: ' + r.mitigation + '\n'; });
  text += '\nASSUMPTIONS:\n';
  (raid.assumptions || []).forEach(function (a) { text += '- ' + a + '\n'; });
  text += '\nDEPENDENCIES:\n';
  (raid.dependencies || []).forEach(function (d) { text += '- ' + d.description + ' (Owner: ' + d.owner + ')\n'; });
  if (raid.issues && raid.issues.length) { text += '\nISSUES:\n'; raid.issues.forEach(function (i) { text += '- ' + i + '\n'; }); }
  return text;
}

// ==================== JIRA IMPORT ====================
/**
 * FIX NOTES (v2):
 * - All JQL searches now use GET /rest/api/3/search with URL-encoded params
 *   instead of POST /rest/api/3/search/jql (which returns 400 on many Jira Cloud
 *   instances due to strict payload validation).
 * - Fields are passed as a comma-separated string: &fields=summary,description,...
 * - jiraPost() is kept for non-search endpoints that genuinely need POST (none here).
 */
function importFromJira(projectKey, options) {
  try {
    if (!projectKey) return { success: false, error: 'No project key provided.' };
    options = options || {};

    var auth = Utilities.base64Encode(CONFIG.JIRA_EMAIL + ':' + CONFIG.JIRA_API_TOKEN);
    var baseUrl = 'https://' + CONFIG.JIRA_DOMAIN;

    Logger.log('importFromJira: starting for project ' + projectKey);

    // ── 1. Fetch all Epics ───────────────────────────────────────────────────
    var epics = jiraFetchEpics(projectKey, auth, baseUrl, options.maxEpics || 50);
    if (!epics.length) {
      return {
        success: false, error: 'No Epics found in project ' + projectKey +
          '. Ensure issues exist with Epic issue type and the project key is correct.'
      };
    }
    Logger.log('importFromJira: fetched ' + epics.length + ' epics');

    // ── 2. Fetch Stories + Subtasks for each Epic ────────────────────────────
    var planEpics = [];
    epics.forEach(function (epicIssue) {
      var stories = jiraFetchStoriesForEpic(epicIssue.key, auth, baseUrl);
      var planStories = stories.map(function (storyIssue) {
        var subtasks = jiraFetchSubtasks(storyIssue.key, storyIssue.fields.subtasks || [], auth, baseUrl);
        var sp = extractStoryPoints(storyIssue.fields);
        var acText = extractAcceptanceCriteria(storyIssue.fields.description);
        return {
          summary: storyIssue.fields.summary || 'Untitled Story',
          description: extractPlainText(storyIssue.fields.description) || '',
          storyPoints: GUARD.nearestFib(sp || 3),
          acceptanceCriteria: acText,
          subtasks: subtasks,
          jiraKey: storyIssue.key,
          status: (storyIssue.fields.status && storyIssue.fields.status.name) || 'To Do',
          assignee: extractAssigneeName(storyIssue.fields.assignee)
        };
      });
      var epicSP = planStories.reduce(function (a, s) { return a + s.storyPoints; }, 0);
      planEpics.push({
        summary: epicIssue.fields.summary || 'Untitled Epic',
        description: extractPlainText(epicIssue.fields.description) || '',
        stories: planStories,
        jiraKey: epicIssue.key,
        totalStoryPoints: epicSP
      });
    });

    // ── 3. Fetch Sprints via Agile Board API ─────────────────────────────────
    var planSprints = jiraFetchSprints(projectKey, auth, baseUrl, options.includeClosedSprints || false);
    Logger.log('importFromJira: fetched ' + planSprints.length + ' sprints');

    // ── 4. Map stories to sprints ────────────────────────────────────────────
    planSprints = enrichSprintsWithStories(planSprints, planEpics, auth, baseUrl);

    // ── 5. Fetch RAID log ────────────────────────────────────────────────────
    var raidLog = jiraFetchRaidLog(projectKey, auth, baseUrl);

    // ── 6. Fetch Test Cases ──────────────────────────────────────────────────
    var testCases = jiraFetchTestCases(projectKey, auth, baseUrl);

    // ── 7. Assemble final plan ───────────────────────────────────────────────
    var projectPlan = {
      epics: planEpics,
      sprints: planSprints,
      raidLog: raidLog,
      testCases: testCases,
      importedFromJira: true,
      importedProjectKey: projectKey,
      importedAt: new Date().toISOString()
    };

    var gr = GUARD.validateAndFix(projectPlan);
    projectPlan = gr.plan;

    var planId = storePlanInSheet(projectPlan);
    Logger.log('importFromJira: stored as planId=' + planId);

    return {
      success: true,
      planId: planId,
      plan: projectPlan,
      summary: {
        epics: planEpics.length,
        stories: planEpics.reduce(function (a, e) { return a + e.stories.length; }, 0),
        sprints: planSprints.length,
        testCases: testCases.length,
        raidItems: raidLog.risks.length + raidLog.issues.length +
          raidLog.assumptions.length + raidLog.dependencies.length
      }
    };
  } catch (err) {
    Logger.log('importFromJira ERROR: ' + err.toString() + '\n' + (err.stack || ''));
    return { success: false, error: err.toString() };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// FIXED: jiraSearchGet() — the single helper used for ALL JQL searches.
// Uses GET /rest/api/3/search with URL query params (NOT POST /search/jql).
// This avoids the 400 "Invalid request payload" error from Jira Cloud.
// ─────────────────────────────────────────────────────────────────────────────
function jiraSearchGet(auth, baseUrl, jql, fields, nextPageToken, maxResults) {
  maxResults = maxResults || 50;

  // Build URL with query parameters
  var url = baseUrl + '/rest/api/3/search/jql?jql=' + encodeURIComponent(jql);

  // Add pagination parameters
  if (nextPageToken) {
    url += '&nextPageToken=' + encodeURIComponent(nextPageToken);
  } else {
    url += '&maxResults=' + maxResults;
  }

  // Add fields if specified
  if (fields && fields.length) {
    url += '&fields=' + encodeURIComponent(fields.join(','));
  }

  var response = UrlFetchApp.fetch(url, {
    method: 'GET',
    headers: {
      Authorization: 'Basic ' + auth,
      Accept: 'application/json'
    },
    muteHttpExceptions: true
  });

  var code = response.getResponseCode();
  var text = response.getContentText();

  if (code !== 200) {
    throw new Error('Jira API error ' + code + ': ' + text);
  }

  return JSON.parse(text);
}


// ── Fetch all Epics (GET-based) ───────────────────────────────────────────────
function jiraFetchEpics(projectKey, auth, baseUrl, maxEpics) {
  var allEpics = [];
  var nextPageToken = null;
  maxEpics = maxEpics || 50;

  var fields = ['summary', 'description', 'status', 'assignee', CONFIG.JIRA_STORY_POINTS_FIELD];
  var jql = 'project="' + projectKey + '" AND issuetype="Epic" ORDER BY created ASC';

  while (allEpics.length < maxEpics) {
    var result = jiraSearchGet(auth, baseUrl, jql, fields, nextPageToken, 50);
    var issues = result.issues || [];

    allEpics = allEpics.concat(issues);

    // Check for next page token
    nextPageToken = result.nextPageToken;
    if (!nextPageToken || issues.length === 0) {
      break;
    }
  }

  return allEpics.slice(0, maxEpics);
}

// ── Fetch Stories for an Epic (GET-based) ────────────────────────────────────

function jiraFetchStoriesForEpic(epicKey, auth, baseUrl) {
  var allStories = [];
  var nextPageToken = null;

  var fields = ['summary', 'description', 'status', 'assignee', 'subtasks', CONFIG.JIRA_STORY_POINTS_FIELD];

  // Try both parent field types
  var jqlQueries = [
    'issuetype = Story AND parent = "' + epicKey + '"',
    'issuetype = Story AND "Epic Link" = "' + epicKey + '"'
  ];

  for (var q = 0; q < jqlQueries.length; q++) {
    var jql = jqlQueries[q];
    nextPageToken = null;

    while (true) {
      try {
        var result = jiraSearchGet(auth, baseUrl, jql, fields, nextPageToken, 50);
        var issues = result.issues || [];
        allStories = allStories.concat(issues);

        nextPageToken = result.nextPageToken;
        if (!nextPageToken || issues.length === 0) {
          break;
        }
      } catch (e) {
        Logger.log('JQL query failed: ' + jql + ' - ' + e);
        break;
      }
    }
  }

  // Deduplicate by key
  var seen = {};
  return allStories.filter(function (issue) {
    if (seen[issue.key]) return false;
    seen[issue.key] = true;
    return true;
  });
}


// ── Fetch full Subtask details ────────────────────────────────────────────────
function jiraFetchSubtasks(parentKey, subtaskRefs, auth, baseUrl) {
  if (!subtaskRefs || !subtaskRefs.length) return [];
  return subtaskRefs.map(function (sub) {
    try {
      var url = baseUrl + '/rest/api/3/issue/' + sub.key
        + '?fields=summary,description,' + CONFIG.JIRA_STORY_POINTS_FIELD;
      var resp = jiraGet(url, auth);
      var sp = extractStoryPoints(resp.fields || {});
      return {
        summary: (resp.fields && resp.fields.summary) || sub.fields.summary || 'Subtask',
        description: extractPlainText((resp.fields || {}).description) || '',
        storyPoints: GUARD.nearestFib(sp || 2),
        jiraKey: sub.key
      };
    } catch (e) {
      return {
        summary: (sub.fields && sub.fields.summary) || 'Subtask',
        description: '',
        storyPoints: 2,
        jiraKey: sub.key
      };
    }
  });
}

// ── Fetch Sprints from Agile Board API ────────────────────────────────────────
function jiraFetchSprints(projectKey, auth, baseUrl, includeClosedSprints) {
  try {
    var boardsUrl = baseUrl + '/rest/agile/1.0/board?projectKeyOrId=' + projectKey + '&maxResults=10';
    var boardsResp = jiraGet(boardsUrl, auth);
    var boards = boardsResp.values || [];
    if (!boards.length) return [];

    var boardId = boards[0].id;
    var sprints = [];
    var startAt = 0;
    var pageSize = 50;
    var stateFilter = includeClosedSprints ? 'active,closed,future' : 'active,future';

    while (true) {
      var sprintsUrl = baseUrl + '/rest/agile/1.0/board/' + boardId + '/sprint' +
        '?state=' + stateFilter +
        '&startAt=' + startAt +
        '&maxResults=' + pageSize;
      var spResp = jiraGet(sprintsUrl, auth);
      var vals = spResp.values || [];
      sprints = sprints.concat(vals);

      if (vals.length < pageSize || sprints.length >= (spResp.total || 999)) break;
      startAt += pageSize;
    }

    return sprints
      .sort(function (a, b) { return (a.id || 0) - (b.id || 0); })
      .map(function (s, idx) {
        return {
          sprintNumber: idx + 1,
          sprintId: s.id,
          sprintName: s.name || ('Sprint ' + (idx + 1)),
          startDate: s.startDate ? s.startDate.substring(0, 10) : '',
          endDate: s.endDate ? s.endDate.substring(0, 10) : (s.completeDate ? s.completeDate.substring(0, 10) : ''),
          goal: s.goal || '',
          state: s.state || 'future',
          storyKeys: [],
          totalStoryPoints: 0
        };
      });
  } catch (e) {
    Logger.log('jiraFetchSprints error: ' + e);
    return [];
  }
}

function getIssuesInSprint(sprintId, auth, baseUrl) {
  var allIssues = [];
  var nextPageToken = null;

  var jql = 'sprint = ' + sprintId;
  var fields = ['summary', 'issuetype', CONFIG.JIRA_STORY_POINTS_FIELD];

  while (true) {
    var result = jiraSearchGet(auth, baseUrl, jql, fields, nextPageToken, 50);
    var issues = result.issues || [];
    allIssues = allIssues.concat(issues);

    nextPageToken = result.nextPageToken;
    if (!nextPageToken || issues.length === 0) {
      break;
    }
  }

  return allIssues;
}



// ── Enrich sprints with stories ───────────────────────────────────────────────
function enrichSprintsWithStories(planSprints, planEpics, auth, baseUrl) {
  if (!planSprints.length) return planSprints;

  for (var s = 0; s < planSprints.length; s++) {
    var sprint = planSprints[s];
    if (!sprint.sprintId) continue;

    try {
      var issues = getIssuesInSprint(sprint.sprintId, auth, baseUrl);
      var storyKeys = [];
      var totalSP = 0;

      for (var i = 0; i < issues.length; i++) {
        var issue = issues[i];
        var typeName = ((issue.fields || {}).issuetype || {}).name || '';
        if (typeName === 'Story') {
          storyKeys.push(issue.fields.summary || issue.key);
          totalSP += extractStoryPoints(issue.fields || {});
        }
      }

      sprint.storyKeys = storyKeys;
      sprint.totalStoryPoints = totalSP || sprint.totalStoryPoints;
    } catch (e) {
      Logger.log('enrichSprintsWithStories sprint ' + sprint.sprintNumber + ' error: ' + e);
    }
  }

  // Distribute unassigned stories to future sprints
  var assignedStories = [];
  for (var s2 = 0; s2 < planSprints.length; s2++) {
    assignedStories = assignedStories.concat(planSprints[s2].storyKeys);
  }

  var allStories = [];
  for (var e = 0; e < planEpics.length; e++) {
    for (var st = 0; st < planEpics[e].stories.length; st++) {
      allStories.push(planEpics[e].stories[st].summary);
    }
  }

  var unassigned = allStories.filter(function (s) {
    return assignedStories.indexOf(s) === -1;
  });

  if (unassigned.length > 0) {
    var futureSprints = planSprints.filter(function (s) { return s.state === 'future'; });
    if (!futureSprints.length && planSprints.length) futureSprints = [planSprints[planSprints.length - 1]];
    var perSprint = Math.ceil(unassigned.length / (futureSprints.length || 1));

    for (var f = 0; f < futureSprints.length; f++) {
      var sprint = futureSprints[f];
      var slice = unassigned.slice(f * perSprint, (f + 1) * perSprint);
      sprint.storyKeys = sprint.storyKeys.concat(slice);

      var addedSP = 0;
      for (var us = 0; us < slice.length; us++) {
        var found = null;
        for (var e2 = 0; e2 < planEpics.length; e2++) {
          for (var st2 = 0; st2 < planEpics[e2].stories.length; st2++) {
            if (planEpics[e2].stories[st2].summary === slice[us]) {
              found = planEpics[e2].stories[st2];
              break;
            }
          }
          if (found) break;
        }
        addedSP += found ? found.storyPoints : 5;
      }
      sprint.totalStoryPoints += addedSP;
    }
  }

  return planSprints;
}

// ── Fetch RAID Log from Tasks (GET-based) ─────────────────────────────────────
function jiraFetchRaidLog(projectKey, auth, baseUrl) {
  var raidLog = { risks: [], assumptions: [], dependencies: [], issues: [] };
  try {
    var jql = 'project="' + projectKey + '" AND issuetype=Task AND summary~"RAID Log" ORDER BY created DESC';
    var fields = ['summary', 'description'];
    var resp = jiraSearchGet(auth, baseUrl, jql, fields, 0, 5);
    var issues = resp.issues || [];
    if (!issues.length) return raidLog;

    var raidText = extractPlainText(issues[0].fields.description) || '';
    var lines = raidText.split('\n');
    var currentSection = '';

    lines.forEach(function (line) {
      var l = line.trim();
      if (!l) return;
      if (l.toUpperCase().indexOf('RISK') > -1 && l.indexOf(':') > -1) { currentSection = 'risks'; return; }
      if (l.toUpperCase().indexOf('ASSUMPTION') > -1 && l.indexOf(':') > -1) { currentSection = 'assumptions'; return; }
      if (l.toUpperCase().indexOf('DEPENDENC') > -1 && l.indexOf(':') > -1) { currentSection = 'dependencies'; return; }
      if (l.toUpperCase().indexOf('ISSUE') > -1 && l.indexOf(':') > -1) { currentSection = 'issues'; return; }

      if (l.startsWith('-') || l.startsWith('•')) {
        var text = l.replace(/^[-•]\s*/, '').trim();
        if (!text) return;
        if (currentSection === 'risks') {
          var mi = text.toLowerCase().indexOf('mitigation:');
          if (mi > -1) {
            raidLog.risks.push({ description: text.substring(0, mi).trim(), mitigation: text.substring(mi + 11).trim() });
          } else {
            raidLog.risks.push({ description: text, mitigation: 'To be determined' });
          }
        } else if (currentSection === 'assumptions') {
          raidLog.assumptions.push(text);
        } else if (currentSection === 'dependencies') {
          var oi = text.toLowerCase().indexOf('(owner:');
          if (oi > -1) {
            raidLog.dependencies.push({ description: text.substring(0, oi).trim(), owner: text.substring(oi + 7).replace(')', '').trim() });
          } else {
            raidLog.dependencies.push({ description: text, owner: 'TBD' });
          }
        } else if (currentSection === 'issues') {
          raidLog.issues.push(text);
        }
      }
    });
  } catch (e) {
    Logger.log('jiraFetchRaidLog error: ' + e);
  }
  return raidLog;
}

// ── Fetch Test Cases from Tasks (GET-based) ───────────────────────────────────
function jiraFetchTestCases(projectKey, auth, baseUrl) {
  var testCases = [];
  try {
    var jql = 'project="' + projectKey + '" AND issuetype=Task AND summary~"Test:" ORDER BY created ASC';
    var fields = ['summary', 'description'];
    var resp = jiraSearchGet(auth, baseUrl, jql, fields, 0, 100);
    var issues = resp.issues || [];

    issues.forEach(function (issue) {
      var summary = issue.fields.summary || '';
      var type = 'positive';
      if (summary.toUpperCase().indexOf('[NEGATIVE]') > -1) type = 'negative';
      else if (summary.toUpperCase().indexOf('[EDGE]') > -1) type = 'edge';

      var title = summary.replace(/^\[(POSITIVE|NEGATIVE|EDGE)\]\s*Test:\s*/i, '').trim();
      var plainText = extractPlainText(issue.fields.description) || '';
      var precondition = '', steps = [], expectedResult = '';
      var section = '';

      plainText.split('\n').forEach(function (line) {
        var l = line.trim();
        if (!l) return;
        if (l.toLowerCase().indexOf('precondition') > -1 && l.indexOf(':') > -1) {
          precondition = l.replace(/precondition[s]?\s*:/i, '').trim();
          section = 'precondition'; return;
        }
        if (l.toLowerCase() === 'steps:' || l.toLowerCase() === 'steps') { section = 'steps'; return; }
        if (l.toLowerCase().indexOf('expected result') > -1 && l.indexOf(':') > -1) {
          expectedResult = l.replace(/expected result[s]?\s*:/i, '').trim();
          section = 'expected'; return;
        }
        if (section === 'steps' && /^\d+\./.test(l)) {
          steps.push(l.replace(/^\d+\.\s*/, '').trim());
        } else if (section === 'expected' && l) {
          expectedResult += (expectedResult ? ' ' : '') + l;
        } else if (section === 'precondition' && l && !steps.length) {
          precondition += (precondition ? ' ' : '') + l;
        }
      });

      if (title) {
        testCases.push({
          title: title,
          type: type,
          precondition: precondition || 'Standard environment',
          steps: steps.length ? steps : ['Execute the test scenario'],
          expectedResult: expectedResult || 'System behaves as expected'
        });
      }
    });
  } catch (e) {
    Logger.log('jiraFetchTestCases error: ' + e);
  }
  return testCases;
}

// ── Low-level GET helper ──────────────────────────────────────────────────────
function jiraGet(url, auth, retryCount) {
  retryCount = retryCount || 0;
  var maxRetries = 3;

  var response = UrlFetchApp.fetch(url, {
    method: 'GET',
    headers: {
      Authorization: 'Basic ' + auth,
      Accept: 'application/json'
    },
    muteHttpExceptions: true
  });

  var code = response.getResponseCode();
  var text = response.getContentText();

  // Handle rate limiting
  if (code === 429 && retryCount < maxRetries) {
    var waitTime = Math.pow(2, retryCount) * 1000;
    Utilities.sleep(waitTime);
    return jiraGet(url, auth, retryCount + 1);
  }

  if (code < 200 || code >= 300) {
    throw new Error('Jira GET error ' + code + ': ' + text.substring(0, 400));
  }

  return JSON.parse(text);
}

// ── ADF → plain text ──────────────────────────────────────────────────────────
function extractPlainText(adf) {
  if (!adf) return '';
  if (typeof adf === 'string') return adf;
  var text = '';
  function walk(node) {
    if (!node) return;
    if (node.type === 'text') { text += (node.text || ''); return; }
    if (node.type === 'hardBreak' || node.type === 'paragraph') text += '\n';
    if (Array.isArray(node.content)) node.content.forEach(walk);
  }
  walk(adf);
  return text.replace(/\n{3,}/g, '\n\n').trim();
}

// ── Acceptance Criteria extractor ─────────────────────────────────────────────
function extractAcceptanceCriteria(adf) {
  var text = extractPlainText(adf);
  if (!text) return [];
  var lines = text.split('\n');
  var acLines = [];
  var inAC = false;
  lines.forEach(function (line) {
    var l = line.trim();
    if (!l) return;
    if (l.toLowerCase().indexOf('acceptance criteria') > -1) { inAC = true; return; }
    if (inAC && (l.startsWith('-') || l.startsWith('•') || /^\d+\./.test(l))) {
      var clean = l.replace(/^[-•\d.]\s*/, '').trim();
      if (clean) acLines.push(clean);
    } else if (inAC && l.length > 10 && !l.endsWith(':')) {
      acLines.push(l);
    }
  });
  return acLines;
}

// ── Story points extractor ────────────────────────────────────────────────────
function extractStoryPoints(fields) {
  if (!fields) return 0;
  var sp = fields[CONFIG.JIRA_STORY_POINTS_FIELD];
  if (sp !== null && sp !== undefined && !isNaN(Number(sp))) return Math.round(Number(sp));
  if (fields.story_points) return Math.round(Number(fields.story_points));
  if (fields.customfield_10028) return Math.round(Number(fields.customfield_10028));
  return 0;
}

// ── Assignee name extractor ───────────────────────────────────────────────────
function extractAssigneeName(assigneeField) {
  if (!assigneeField) return 'Unassigned';
  return assigneeField.displayName || assigneeField.name || 'Unassigned';
}

// ── Save plan to shared drive (stub) ─────────────────────────────────────────
function savePlanToSharedDrive(planId, drivePath) {
  try {
    var ss = SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
    var sheet = ss.getSheetByName('ProjectPlans');
    if (!sheet) return { success: false, error: 'ProjectPlans sheet not found' };
    var row = findPlanRow(sheet, planId);
    if (!row) return { success: false, error: 'Plan not found' };
    return { success: true, message: 'Plan ' + planId.substring(0, 8) + ' is stored in Google Sheets.' };
  } catch (e) {
    return { success: false, error: e.toString() };
  }
}

// ==================== EXCEL EXPORT ====================
var XL = {
  KIPI_BLUE: '#3D85C6', KIPI_BLUE_LT: '#CFE2F3', KIPI_GREEN_LT: '#D9EAD3',
  KIPI_GRAY: '#F3F3F3', KIPI_PHASE: '#E8F0FE',
  STATUS_DONE: '#B6D7A8', STATUS_IP: '#FFE599', STATUS_PLAN: '#CFE2F3',
  STATUS_BLOCKED: '#EA9999', STATUS_REVIEW: '#FFD966',
  NAVY: '#0f172a', INK: '#1e293b', BLUE: '#3b6be8', BLUE_LT: '#eef3fd',
  E1: '#3b6be8', E1L: '#eef3fd', E2: '#0e9488', E2L: '#e6f7f6',
  E3: '#7c3aed', E3L: '#f5f3ff', E4: '#d97706', E4L: '#fffbeb',
  E5: '#059669', E5L: '#ecfdf5', E6: '#dc2626', E6L: '#fef2f2',
  GREEN: '#059669', GREEN_LT: '#ecfdf5', RED: '#dc2626', RED_LT: '#fef2f2',
  GOLD: '#d97706', GOLD_LT: '#fffbeb', PURPLE: '#7c3aed', TEAL: '#0e9488',
  TEAL_LT: '#e6f7f6', WHITE: '#ffffff', GRAY_100: '#f3f4f6', GRAY_200: '#e5e7eb',
  TEXT: '#111827'
};

function xs(range, opts) {
  if (!range || !opts) return range;
  try { if (opts.bg) range.setBackground(opts.bg); } catch (e) { }
  try { if (opts.fg) range.setFontColor(opts.fg); } catch (e) { }
  try { if (opts.bold) range.setFontWeight('bold'); } catch (e) { }
  try { if (opts.sz) range.setFontSize(opts.sz); } catch (e) { }
  try { if (opts.italic) range.setFontStyle('italic'); } catch (e) { }
  try { if (opts.ha) range.setHorizontalAlignment(opts.ha); } catch (e) { }
  try { if (opts.va) range.setVerticalAlignment(opts.va); } catch (e) { }
  try { if (opts.wrap) range.setWrap(true); } catch (e) { }
  try { if (opts.val !== undefined) range.setValue(opts.val); } catch (e) { }
  try { if (opts.ff) range.setFontFamily(opts.ff); } catch (e) { }
  try {
    if (opts.border) {
      var bc = opts.borderColor || XL.GRAY_200;
      range.setBorder(true, true, true, true, false, false, bc, SpreadsheetApp.BorderStyle.SOLID);
    }
  } catch (e) { }
  try { if (opts.merge) range.merge(); } catch (e) { }
  return range;
}

function rh(sheet, row, height) { try { sheet.setRowHeight(row, Math.max(4, height)); } catch (e) { } }

function xlStatusBg(status) {
  var s = (status || '').toLowerCase();
  if (s === 'complete' || s === 'done' || s === 'closed') return XL.STATUS_DONE;
  if (s === 'in progress' || s === 'in functional test') return XL.STATUS_IP;
  if (s === 'blocked') return XL.STATUS_BLOCKED;
  if (s === 'in review' || s === 'review') return XL.STATUS_REVIEW;
  return XL.STATUS_PLAN;
}

function xlBuildCover(ss, plan, planId) {
  var sh = ss.insertSheet('Project Details', 0);
  sh.setHiddenGridlines(false);
  var epics = plan.epics || [], sprints = plan.sprints || [];
  var totalSP = epics.reduce(function (a, e) { return a + (e.stories || []).reduce(function (b, s) { return b + (s.storyPoints || 0); }, 0); }, 0);
  var startDate = sprints.length ? sprints[0].startDate : '';
  var endDate = sprints.length ? sprints[sprints.length - 1].endDate : '';
  var projName = plan.projectName || (epics.length ? epics[0].summary : 'AI Generated Project');

  rh(sh, 1, 48);
  xs(sh.getRange(1, 2), { bg: XL.WHITE, bold: true, sz: 11, val: 'Client LOGO', va: 'middle' });
  xs(sh.getRange(1, 3, 1, 4).merge(), { bg: XL.KIPI_BLUE, fg: XL.WHITE, bold: true, sz: 14, val: 'PROJECT PLAN', ha: 'center', va: 'middle' });
  rh(sh, 2, 22);
  xs(sh.getRange(2, 2, 1, 2).merge(), { bg: XL.KIPI_BLUE, fg: XL.WHITE, bold: true, sz: 10, val: 'Project Details', ha: 'center', va: 'middle' });
  xs(sh.getRange(2, 5, 1, 3).merge(), { bg: XL.KIPI_BLUE, fg: XL.WHITE, bold: true, sz: 10, val: 'Use Case', ha: 'center', va: 'middle' });
  var details = [
    ['Project Name', projName, 'Client Business Overview', ''],
    ['Project Start Date', startDate, 'Brief Use Case Description', ''],
    ['Project End Date', endDate, 'Measurable Business Outcome', ''],
    ['Project Manager', 'TBD', 'Measurable Technical Deliverables', 'Pipelines, KPIs, environments, tables/schemas..']
  ];
  details.forEach(function (d, i) {
    rh(sh, 3 + i, 22);
    xs(sh.getRange(3 + i, 2), { bg: XL.GRAY_100, bold: true, sz: 9, val: d[0], va: 'middle' });
    xs(sh.getRange(3 + i, 3), { bg: XL.WHITE, sz: 9, val: d[1], va: 'middle' });
    xs(sh.getRange(3 + i, 5), { bg: XL.GRAY_100, bold: true, sz: 9, val: d[2], va: 'middle' });
    xs(sh.getRange(3 + i, 6, 1, 2).merge(), { bg: XL.WHITE, sz: 9, val: d[3], wrap: true, va: 'middle' });
  });
  rh(sh, 7, 10);
  rh(sh, 8, 22);
  xs(sh.getRange(8, 2, 1, 3).merge(), { bg: XL.KIPI_BLUE, fg: XL.WHITE, bold: true, sz: 10, val: 'Kipi Project Team', ha: 'center', va: 'middle' });
  xs(sh.getRange(8, 5, 1, 3).merge(), { bg: XL.KIPI_BLUE, fg: XL.WHITE, bold: true, sz: 10, val: '[Client Name] Project Team', ha: 'center', va: 'middle' });
  rh(sh, 9, 20);
  ['Name', 'Role', 'Hrs/week'].forEach(function (h, i) { xs(sh.getRange(9, 2 + i), { bg: XL.KIPI_GREEN_LT, bold: true, sz: 9, val: h, ha: 'center', va: 'middle', border: true, borderColor: XL.GRAY_200 }); });
  ['Name', 'Role'].forEach(function (h, i) { xs(sh.getRange(9, 5 + i), { bg: XL.KIPI_BLUE_LT, bold: true, sz: 9, val: h, ha: 'center', va: 'middle', border: true, borderColor: XL.GRAY_200 }); });
  for (var r = 10; r <= 14; r++) {
    rh(sh, r, 20);
    for (var c = 2; c <= 4; c++) sh.getRange(r, c).setBackground(XL.WHITE).setBorder(true, true, true, true, false, false, XL.GRAY_200, SpreadsheetApp.BorderStyle.SOLID);
    for (var c = 5; c <= 6; c++) sh.getRange(r, c).setBackground(XL.WHITE).setBorder(true, true, true, true, false, false, XL.GRAY_200, SpreadsheetApp.BorderStyle.SOLID);
  }
  rh(sh, 16, 14);
  xs(sh.getRange(16, 2, 1, 5).merge(), { bg: XL.KIPI_BLUE, fg: XL.WHITE, bold: true, sz: 10, val: 'PROJECT SUMMARY METRICS', ha: 'center', va: 'middle' });
  var metrics = [
    ['Total Epics', epics.length],
    ['Total Stories', epics.reduce(function (a, e) { return a + (e.stories || []).length; }, 0)],
    ['Total Story Points', totalSP],
    ['Total Sprints', sprints.length],
    ['Test Cases', (plan.testCases || []).length],
    ['Risks Identified', (plan.raidLog && plan.raidLog.risks ? plan.raidLog.risks.length : 0)],
    ['Plan ID', planId],
    ['Imported from Jira', plan.importedFromJira ? (plan.importedProjectKey || 'Yes') : 'No']
  ];
  metrics.forEach(function (m, i) {
    rh(sh, 17 + i, 20);
    xs(sh.getRange(17 + i, 2), { bg: XL.KIPI_GRAY, bold: true, sz: 9, val: m[0], va: 'middle' });
    xs(sh.getRange(17 + i, 3), { bg: XL.WHITE, bold: true, sz: 10, val: m[1], ha: 'center', va: 'middle' });
  });
  [20, 160, 160, 20, 180, 180, 180].forEach(function (w, i) { sh.setColumnWidth(i + 1, w); });
}

function xlBuildDashboard(ss, plan) {
  var sh = ss.insertSheet('Project Health Card');
  sh.setHiddenGridlines(false);
  var epics = plan.epics || [], sprints = plan.sprints || [];
  var totalSP = epics.reduce(function (a, e) { return a + (e.stories || []).reduce(function (b, s) { return b + (s.storyPoints || 0); }, 0); }, 0);
  var totalStories = epics.reduce(function (a, e) { return a + (e.stories || []).length; }, 0);
  var avgVel = sprints.length ? Math.round(sprints.reduce(function (a, s) { return a + (s.totalStoryPoints || 0); }, 0) / sprints.length) : 0;
  var riskCount = (plan.raidLog && plan.raidLog.risks) ? plan.raidLog.risks.length : 0;
  var testCount = (plan.testCases || []).length;
  var startDate = sprints.length ? sprints[0].startDate : '';
  var endDate = sprints.length ? sprints[sprints.length - 1].endDate : '';
  rh(sh, 1, 48);
  xs(sh.getRange(1, 1, 1, 7).merge(), { bg: XL.KIPI_BLUE, fg: XL.WHITE, bold: true, sz: 16, val: 'PROJECT HEALTH CARD', ha: 'center', va: 'middle', ff: 'Arial' });
  rh(sh, 2, 22);
  xs(sh.getRange(2, 1, 1, 7).merge(), { bg: XL.KIPI_GRAY, fg: XL.INK, sz: 9, val: 'BRD → Jira AI Engine v4.0  |  Generated: ' + new Date().toDateString() + (plan.importedFromJira ? ' | Source: Jira ' + plan.importedProjectKey : ''), ha: 'center', va: 'middle' });
  rh(sh, 3, 8); sh.getRange(3, 1, 1, 7).merge().setBackground(XL.GRAY_200);
  var row = 4;
  var kpis = [
    ['Project Start', startDate, XL.KIPI_BLUE], ['Project End', endDate, XL.KIPI_BLUE],
    ['Total Epics', epics.length, XL.E1], ['Total Stories', totalStories, XL.E2],
    ['Total Story Points', totalSP, XL.E3], ['Sprints Planned', sprints.length, XL.E4],
    ['Avg Velocity (SP/Sprint)', avgVel, XL.E5],
    ['Risks Identified', riskCount, riskCount > 5 ? XL.RED : riskCount > 2 ? XL.GOLD : XL.GREEN],
    ['Test Cases Generated', testCount, XL.TEAL],
    ['Test Coverage', totalStories > 0 ? Math.round(testCount / totalStories * 100) + '%' : 'N/A', XL.PURPLE],
    ['Data Source', plan.importedFromJira ? 'Imported from Jira' : 'AI Generated', XL.KIPI_BLUE]
  ];
  kpis.forEach(function (k, i) {
    rh(sh, row + i, 28);
    xs(sh.getRange(row + i, 1, 1, 3).merge(), { bg: k[2], fg: XL.WHITE, bold: true, sz: 10, val: k[0], va: 'middle' });
    xs(sh.getRange(row + i, 4, 1, 4).merge(), { bg: i % 2 === 0 ? XL.GRAY_100 : XL.WHITE, bold: true, sz: 14, val: k[1], ha: 'center', va: 'middle' });
  });
  [160, 80, 80, 80, 80, 80, 80].forEach(function (w, i) { sh.setColumnWidth(i + 1, w); });
}

function xlBuildEpics(ss, plan) {
  var sh = ss.insertSheet('Project PlanTracker');
  sh.setHiddenGridlines(false);
  rh(sh, 1, 10); rh(sh, 2, 40);
  xs(sh.getRange(2, 2), { bg: XL.WHITE, bold: true, sz: 11, val: 'Client LOGO', va: 'middle' });
  xs(sh.getRange(2, 4, 1, 4).merge(), { bg: XL.KIPI_BLUE, fg: XL.WHITE, bold: true, sz: 14, val: 'PROJECT TITLE', ha: 'center', va: 'middle' });
  rh(sh, 3, 24);
  xs(sh.getRange(3, 4, 1, 4).merge(), { bg: XL.KIPI_BLUE, fg: XL.WHITE, bold: true, sz: 11, val: 'PROJECT MANAGER', ha: 'center', va: 'middle' });
  rh(sh, 4, 8);
  rh(sh, 5, 24);
  var headers = ['S. No.', 'Deliverable', 'Tasks', 'START DATE', 'ACTUAL START DATE', 'END DATE', 'ACTUAL END DATE', 'ASSIGNEE', 'STATUS', 'Deliverable Delivery Date', 'ESTIMATED HOURS', 'RAID Log ID'];
  headers.forEach(function (h, i) { xs(sh.getRange(5, 2 + i), { bg: XL.KIPI_GRAY, bold: true, sz: 9, val: h, ha: 'center', va: 'middle', border: true, borderColor: XL.GRAY_200 }); });

  var row = 6, sprints = plan.sprints || [], epics = plan.epics || [];
  var storySprintMap = {};
  sprints.forEach(function (s) { (s.storyKeys || []).forEach(function (key) { storySprintMap[key] = s; }); });
  var sprintGroups = {};
  sprints.forEach(function (s) { sprintGroups['S' + s.sprintNumber] = { sprint: s, items: [] }; });
  sprintGroups['unassigned'] = { sprint: null, items: [] };
  epics.forEach(function (epic) {
    (epic.stories || []).forEach(function (story) {
      var sprintMatch = storySprintMap[story.summary] || null;
      var key = sprintMatch ? 'S' + sprintMatch.sprintNumber : 'unassigned';
      if (!sprintGroups[key]) sprintGroups[key] = { sprint: sprintMatch, items: [] };
      sprintGroups[key].items.push({ epic: epic, story: story, sprint: sprintMatch });
    });
  });
  var groupKeys = sprints.map(function (s) { return 'S' + s.sprintNumber; });
  if (sprintGroups['unassigned'].items.length) groupKeys.push('unassigned');
  var sno = 1;
  groupKeys.forEach(function (gk) {
    var g = sprintGroups[gk]; if (!g || !g.items.length) return;
    var s = g.sprint;
    rh(sh, row, 22);
    xs(sh.getRange(row, 2, 1, 12).merge(), { bg: XL.KIPI_BLUE, fg: XL.WHITE, bold: true, sz: 10, val: s ? 'SP ' + s.sprintNumber + ' (' + s.startDate + ' - ' + s.endDate + ')' : 'Backlog', va: 'middle' });
    row++;
    rh(sh, row, 20);
    xs(sh.getRange(row, 2), { bg: XL.KIPI_BLUE, fg: XL.WHITE, bold: true, sz: 9, val: 'Sprint Goal: ', va: 'middle' });
    xs(sh.getRange(row, 3, 1, 11).merge(), { bg: XL.KIPI_BLUE, fg: XL.WHITE, sz: 9, val: s ? s.goal : '', wrap: true, va: 'middle' });
    row++;
    rh(sh, row, 20);
    xs(sh.getRange(row, 2), { bg: XL.KIPI_BLUE, fg: XL.WHITE, bold: true, sz: 9, val: 'Acceptance Criteria: ', va: 'middle' });
    xs(sh.getRange(row, 3, 1, 11).merge(), { bg: XL.KIPI_BLUE, fg: XL.WHITE, sz: 9, val: (g.items[0].story.acceptanceCriteria || []).join(' | '), wrap: true, va: 'middle' });
    row++;
    g.items.forEach(function (item) {
      var story = item.story, epic = item.epic;
      rh(sh, row, 22);
      xs(sh.getRange(row, 2), { bg: XL.WHITE, sz: 9, val: sno + '.0', ha: 'center', va: 'middle', border: true, borderColor: XL.GRAY_200 });
      xs(sh.getRange(row, 3), { bg: XL.WHITE, bold: true, sz: 9, val: epic.summary, wrap: true, va: 'middle', border: true, borderColor: XL.GRAY_200 });
      xs(sh.getRange(row, 4), { bg: XL.WHITE, sz: 9, val: story.summary, wrap: true, va: 'middle', border: true, borderColor: XL.GRAY_200 });
      xs(sh.getRange(row, 5), { bg: XL.WHITE, sz: 9, val: s ? s.startDate : '', ha: 'center', va: 'middle', border: true, borderColor: XL.GRAY_200 });
      xs(sh.getRange(row, 6), { bg: XL.WHITE, sz: 9, val: '', border: true, borderColor: XL.GRAY_200 });
      xs(sh.getRange(row, 7), { bg: XL.WHITE, sz: 9, val: s ? s.endDate : '', ha: 'center', va: 'middle', border: true, borderColor: XL.GRAY_200 });
      xs(sh.getRange(row, 8), { bg: XL.WHITE, sz: 9, val: '', border: true, borderColor: XL.GRAY_200 });
      xs(sh.getRange(row, 9), { bg: XL.WHITE, sz: 9, val: story.assignee || 'TBD', ha: 'center', va: 'middle', border: true, borderColor: XL.GRAY_200 });
      xs(sh.getRange(row, 10), { bg: xlStatusBg(story.status || 'Planned'), sz: 9, val: story.status || 'Planned', ha: 'center', va: 'middle', border: true, borderColor: XL.GRAY_200 });
      xs(sh.getRange(row, 11), { bg: XL.WHITE, sz: 9, val: s ? s.endDate : '', border: true, borderColor: XL.GRAY_200 });
      xs(sh.getRange(row, 12), { bg: XL.WHITE, sz: 9, val: story.storyPoints || 0, ha: 'center', va: 'middle', border: true, borderColor: XL.GRAY_200 });
      xs(sh.getRange(row, 13), { bg: XL.WHITE, sz: 9, val: story.jiraKey || 'N/A', ha: 'center', va: 'middle', border: true, borderColor: XL.GRAY_200 });
      row++; sno++;
      (story.subtasks || []).forEach(function (sub) {
        rh(sh, row, 20);
        xs(sh.getRange(row, 4), { bg: XL.WHITE, sz: 9, val: '  ↳ ' + sub.summary, wrap: true, va: 'middle', border: true, borderColor: XL.GRAY_200 });
        for (var c = 2; c <= 13; c++) if (c !== 4) sh.getRange(row, c).setBackground(XL.WHITE).setBorder(true, true, true, true, false, false, XL.GRAY_200, SpreadsheetApp.BorderStyle.SOLID);
        xs(sh.getRange(row, 12), { sz: 9, val: sub.storyPoints || 0, ha: 'center', va: 'middle' });
        row++;
      });
    });
    row++;
  });
  [20, 60, 200, 220, 100, 100, 100, 100, 100, 100, 100, 100, 80].forEach(function (w, i) { sh.setColumnWidth(i + 1, w); });
}

function xlBuildSprints(ss, plan) {
  var sh = ss.insertSheet('Project Plan - Client');
  sh.setHiddenGridlines(false);
  var sprints = plan.sprints || [], epics = plan.epics || [];
  var startDate = sprints.length ? sprints[0].startDate : '', endDate = sprints.length ? sprints[sprints.length - 1].endDate : '';
  rh(sh, 1, 10); rh(sh, 2, 36);
  xs(sh.getRange(2, 1, 1, 7).merge(), { bg: XL.KIPI_BLUE, fg: XL.WHITE, bold: true, sz: 16, val: 'PROJECT PLAN', ha: 'center', va: 'middle', ff: 'Arial' });
  rh(sh, 3, 22);
  xs(sh.getRange(3, 2), { bg: XL.KIPI_GRAY, bold: true, sz: 9, val: 'PROJECT TITLE', va: 'middle' });
  xs(sh.getRange(3, 5), { bg: XL.KIPI_GRAY, bold: true, sz: 9, val: 'Start Date', va: 'middle' });
  xs(sh.getRange(3, 6), { bg: XL.WHITE, sz: 9, val: startDate, va: 'middle' });
  rh(sh, 4, 22);
  xs(sh.getRange(4, 2), { bg: XL.KIPI_GRAY, bold: true, sz: 9, val: 'PROJECT MANAGER', va: 'middle' });
  xs(sh.getRange(4, 5), { bg: XL.KIPI_GRAY, bold: true, sz: 9, val: 'End Date', va: 'middle' });
  xs(sh.getRange(4, 6), { bg: XL.WHITE, sz: 9, val: endDate, va: 'middle' });
  rh(sh, 6, 16);
  xs(sh.getRange(6, 1, 1, 7).merge(), { bg: XL.KIPI_BLUE, fg: XL.WHITE, bold: true, sz: 10, val: 'PROJECT DETAILS', va: 'middle' });
  rh(sh, 7, 24);
  ['S. No.', 'DESCRIPTION', 'TASK NAME', 'DELIVERABLES', 'DELIVERY DATE', 'DEPENDENCY', 'DEPENDENCY OWNER'].forEach(function (h, i) {
    xs(sh.getRange(7, i + 1), { bg: XL.KIPI_GRAY, bold: true, sz: 9, val: h, ha: 'center', va: 'middle', border: true, borderColor: XL.GRAY_200 });
  });
  var storySprintMap = {};
  sprints.forEach(function (s) { (s.storyKeys || []).forEach(function (key) { storySprintMap[key] = s; }); });
  var row = 8, sno = 1;
  sprints.forEach(function (s) {
    rh(sh, row, 22);
    xs(sh.getRange(row, 1, 1, 7).merge(), { bg: XL.KIPI_PHASE, bold: true, sz: 10, val: 'Sprint ' + s.sprintNumber + ' (' + s.startDate + ' - ' + s.endDate + ')', va: 'middle' });
    row++;
    rh(sh, row, 20);
    xs(sh.getRange(row, 1, 1, 7).merge(), { bg: XL.KIPI_BLUE, fg: XL.WHITE, bold: true, sz: 9, val: 'SP ' + s.sprintNumber + ' (' + s.startDate + ' - ' + s.endDate + ')', va: 'middle' });
    row++;
    var sprintStories = [];
    epics.forEach(function (epic) {
      (epic.stories || []).forEach(function (story) {
        if ((storySprintMap[story.summary] || {}).sprintNumber === s.sprintNumber) sprintStories.push({ epic: epic, story: story });
      });
    });
    sprintStories.forEach(function (item) {
      var story = item.story, epic = item.epic;
      rh(sh, row, 22);
      xs(sh.getRange(row, 1), { bg: XL.WHITE, sz: 9, val: sno + '.0', ha: 'center', va: 'middle', border: true, borderColor: XL.GRAY_200 });
      xs(sh.getRange(row, 2), { bg: XL.WHITE, bold: true, sz: 9, val: epic.summary, wrap: true, va: 'middle', border: true, borderColor: XL.GRAY_200 });
      xs(sh.getRange(row, 3), { bg: XL.WHITE, sz: 9, val: story.summary, wrap: true, va: 'middle', border: true, borderColor: XL.GRAY_200 });
      xs(sh.getRange(row, 4), { bg: XL.WHITE, sz: 9, val: (story.acceptanceCriteria || []).slice(0, 3).join(' - '), wrap: true, va: 'middle', border: true, borderColor: XL.GRAY_200 });
      xs(sh.getRange(row, 5), { bg: XL.WHITE, sz: 9, val: s.endDate, ha: 'center', va: 'middle', border: true, borderColor: XL.GRAY_200 });
      xs(sh.getRange(row, 6), { bg: XL.WHITE, sz: 9, val: 'N/A', ha: 'center', va: 'middle', border: true, borderColor: XL.GRAY_200 });
      xs(sh.getRange(row, 7), { bg: XL.WHITE, sz: 9, val: 'N/A', ha: 'center', va: 'middle', border: true, borderColor: XL.GRAY_200 });
      row++; sno++;
    });
    row++;
  });
  [60, 220, 220, 240, 100, 160, 140].forEach(function (w, i) { sh.setColumnWidth(i + 1, w); });
}

function xlBuildTests(ss, plan) {
  var sh = ss.insertSheet('Test Cases');
  sh.setHiddenGridlines(false);
  rh(sh, 1, 40);
  xs(sh.getRange(1, 1, 1, 6).merge(), { bg: XL.KIPI_BLUE, fg: XL.WHITE, bold: true, sz: 14, val: 'TEST CASES  —  AI-Generated QA Suite', ha: 'center', va: 'middle', ff: 'Arial' });
  rh(sh, 2, 20);
  xs(sh.getRange(2, 1, 1, 6).merge(), { bg: XL.KIPI_GRAY, sz: 9, val: 'Positive · Negative · Edge case test coverage', ha: 'center', va: 'middle' });
  rh(sh, 3, 8); sh.getRange(3, 1, 1, 6).merge().setBackground(XL.GRAY_200);
  rh(sh, 4, 22);
  ['Task Name / Title', 'Type', 'Precondition', 'Steps', 'Expected Result', 'Remarks'].forEach(function (h, i) {
    xs(sh.getRange(4, i + 1), { bg: XL.KIPI_GRAY, bold: true, sz: 9, val: h, ha: 'center', va: 'middle', border: true, borderColor: XL.GRAY_200 });
  });
  var typeColors = { positive: XL.GREEN, negative: XL.RED, edge: XL.GOLD };
  var row = 5;
  (plan.testCases || []).forEach(function (tc, i) {
    var bg = i % 2 === 0 ? XL.GRAY_100 : XL.WHITE;
    var tc_color = typeColors[tc.type] || XL.KIPI_BLUE;
    rh(sh, row, 60);
    xs(sh.getRange(row, 1), { bg: bg, bold: true, sz: 10, val: tc.title || '', wrap: true, va: 'middle', border: true, borderColor: XL.GRAY_200 });
    xs(sh.getRange(row, 2), { bg: tc_color, fg: XL.WHITE, bold: true, sz: 9, val: (tc.type || '').toUpperCase(), ha: 'center', va: 'middle', border: true, borderColor: XL.GRAY_200 });
    xs(sh.getRange(row, 3), { bg: bg, sz: 9, val: tc.precondition || '', wrap: true, va: 'middle', border: true, borderColor: XL.GRAY_200 });
    xs(sh.getRange(row, 4), { bg: bg, sz: 9, val: (tc.steps || []).map(function (s, i) { return (i + 1) + '. ' + s; }).join('\n'), wrap: true, va: 'middle', border: true, borderColor: XL.GRAY_200 });
    xs(sh.getRange(row, 5), { bg: bg, sz: 9, val: tc.expectedResult || '', wrap: true, va: 'middle', border: true, borderColor: XL.GRAY_200 });
    xs(sh.getRange(row, 6), { bg: bg, sz: 9, val: '', va: 'middle', border: true, borderColor: XL.GRAY_200 });
    row++;
  });
  [220, 80, 180, 260, 200, 100].forEach(function (w, i) { sh.setColumnWidth(i + 1, w); });
}

function xlBuildRaid(ss, plan) {
  var sh = ss.insertSheet('RAID Log');
  sh.setHiddenGridlines(false);
  var raid = plan.raidLog || {};
  rh(sh, 1, 40);
  xs(sh.getRange(1, 1, 1, 12).merge(), { bg: XL.KIPI_BLUE, fg: XL.WHITE, bold: true, sz: 14, val: 'RAID LOG  —  Risks · Assumptions · Issues · Dependencies', ha: 'center', va: 'middle', ff: 'Arial' });
  rh(sh, 2, 8); sh.getRange(2, 1, 1, 12).merge().setBackground(XL.GRAY_200);
  rh(sh, 3, 22);
  ['S. No.', 'Category', 'Description', 'Impact', 'Priority', 'Status', 'Open Date', 'Due Date', 'Closure Date', 'Owner', 'Potential Impact Details', 'Mitigation Plan'].forEach(function (h, i) {
    xs(sh.getRange(3, i + 1), { bg: XL.KIPI_GRAY, bold: true, sz: 9, val: h, ha: 'center', va: 'middle', border: true, borderColor: XL.GRAY_200 });
  });
  var row = 4;
  function addRaidRow(sno, category, description, impact, priority, owner, mitigation, colorBg) {
    rh(sh, row, 36);
    var cats = { RISK: XL.RED, ISSUE: XL.GOLD, ASSUMPTION: XL.TEAL, DEPENDENCY: XL.KIPI_BLUE };
    var catBg = cats[category] || XL.KIPI_BLUE;
    xs(sh.getRange(row, 1), { bg: colorBg, sz: 9, val: sno + '.0', ha: 'center', va: 'middle', border: true, borderColor: XL.GRAY_200 });
    xs(sh.getRange(row, 2), { bg: catBg, fg: XL.WHITE, bold: true, sz: 9, val: category, ha: 'center', va: 'middle', border: true, borderColor: XL.GRAY_200 });
    xs(sh.getRange(row, 3), { bg: colorBg, sz: 9, val: description, wrap: true, va: 'middle', border: true, borderColor: XL.GRAY_200 });
    xs(sh.getRange(row, 4), { bg: colorBg, sz: 9, val: impact || 'High', ha: 'center', va: 'middle', border: true, borderColor: XL.GRAY_200 });
    xs(sh.getRange(row, 5), { bg: colorBg, sz: 9, val: priority || 'Critical', ha: 'center', va: 'middle', border: true, borderColor: XL.GRAY_200 });
    xs(sh.getRange(row, 6), { bg: colorBg, sz: 9, val: 'Open', ha: 'center', va: 'middle', border: true, borderColor: XL.GRAY_200 });
    for (var c = 7; c <= 11; c++) xs(sh.getRange(row, c), { bg: colorBg, sz: 9, val: '', border: true, borderColor: XL.GRAY_200 });
    xs(sh.getRange(row, 10), { bg: colorBg, sz: 9, val: owner || 'TBD', ha: 'center', va: 'middle', border: true, borderColor: XL.GRAY_200 });
    xs(sh.getRange(row, 12), { bg: colorBg, sz: 9, val: mitigation || '', wrap: true, va: 'middle', border: true, borderColor: XL.GRAY_200 });
    row++;
  }
  var sno = 1;
  (raid.risks || []).forEach(function (r, i) { addRaidRow(sno, 'RISK', r.description, 'High', 'Critical', 'Client Name', r.mitigation, i % 2 === 0 ? XL.RED_LT : XL.WHITE); sno++; });
  (raid.issues || []).forEach(function (iss, i) { addRaidRow(sno, 'ISSUE', typeof iss === 'string' ? iss : (iss.description || ''), 'Moderate', 'Moderate', 'Kipi Team', '', i % 2 === 0 ? XL.GOLD_LT : XL.WHITE); sno++; });
  (raid.assumptions || []).forEach(function (a, i) { addRaidRow(sno, 'ASSUMPTION', typeof a === 'string' ? a : (a.description || ''), 'Low', 'Low', 'TBD', '', i % 2 === 0 ? XL.TEAL_LT : XL.WHITE); sno++; });
  (raid.dependencies || []).forEach(function (d, i) { addRaidRow(sno, 'DEPENDENCY', d.description || '', 'High', 'Critical', d.owner || 'TBD', '', i % 2 === 0 ? XL.BLUE_LT : XL.WHITE); sno++; });
  for (var b = 0; b < 5; b++) {
    rh(sh, row, 22);
    for (var c = 1; c <= 12; c++) sh.getRange(row, c).setBackground(XL.WHITE).setBorder(true, true, true, true, false, false, XL.GRAY_200, SpreadsheetApp.BorderStyle.SOLID);
    sh.getRange(row, 1).setValue(sno + '.0'); row++; sno++;
  }
  [50, 100, 260, 80, 80, 100, 90, 90, 90, 120, 200, 200].forEach(function (w, i) { sh.setColumnWidth(i + 1, w); });
}

function xlBuildGantt(ss, plan) {
  var sh = ss.insertSheet('Gantt Chart');
  sh.setHiddenGridlines(false);
  var sprints = plan.sprints || [];
  rh(sh, 1, 40);
  xs(sh.getRange(1, 1, 1, 10).merge(), { bg: XL.KIPI_BLUE, fg: XL.WHITE, bold: true, sz: 14, val: 'GANTT CHART  —  Sprint Timeline Overview', ha: 'center', va: 'middle', ff: 'Arial' });
  rh(sh, 2, 20);
  xs(sh.getRange(2, 1, 1, 10).merge(), { bg: XL.KIPI_GRAY, sz: 9, val: 'Visual sprint schedule with duration, story points and delivery status', ha: 'center', va: 'middle' });
  rh(sh, 3, 8); sh.getRange(3, 1, 1, 10).merge().setBackground(XL.GRAY_200);
  rh(sh, 4, 24);
  ['Sprint', 'Sprint Goal', 'Start Date', 'End Date', 'Duration (days)', 'Story Points', 'Stories', 'Epics Covered', 'Cumulative SP', 'Status'].forEach(function (h, i) {
    xs(sh.getRange(4, i + 1), { bg: XL.KIPI_GRAY, bold: true, sz: 9, val: h, ha: 'center', va: 'middle', border: true, borderColor: XL.GRAY_200 });
  });
  var row = 5, cumSP = 0, totalSP = sprints.reduce(function (a, s) { return a + (s.totalStoryPoints || 0); }, 0);
  var epicsPerSprint = {};
  (plan.epics || []).forEach(function (epic) {
    (epic.stories || []).forEach(function (story) {
      sprints.forEach(function (s) {
        if ((s.storyKeys || []).indexOf(story.summary) > -1) {
          if (!epicsPerSprint[s.sprintNumber]) epicsPerSprint[s.sprintNumber] = {};
          epicsPerSprint[s.sprintNumber][epic.summary] = 1;
        }
      });
    });
  });
  sprints.forEach(function (s, i) {
    var start = s.startDate ? new Date(s.startDate) : null, end = s.endDate ? new Date(s.endDate) : null;
    var dur = (start && end) ? Math.ceil((end - start) / 86400000) : 21;
    var sp = s.totalStoryPoints || 0; cumSP += sp;
    var pct = totalSP > 0 ? Math.round(cumSP / totalSP * 100) : 0;
    var isLast = i === sprints.length - 1;
    var rowBg = i % 2 === 0 ? XL.KIPI_BLUE_LT : XL.WHITE;
    var statusVal = s.state === 'closed' ? 'Completed' : isLast ? 'Sign-Off / UAT' : s.state === 'active' ? 'In Progress' : 'Planned';
    var statusBg = s.state === 'closed' ? XL.STATUS_DONE : isLast ? XL.GREEN_LT : XL.WHITE;
    var epicNames = epicsPerSprint[s.sprintNumber] ? Object.keys(epicsPerSprint[s.sprintNumber]).join(', ') : '';
    rh(sh, row, 28);
    xs(sh.getRange(row, 1), { bg: XL.KIPI_BLUE, fg: XL.WHITE, bold: true, sz: 10, val: 'Sprint ' + s.sprintNumber, ha: 'center', va: 'middle', border: true, borderColor: XL.GRAY_200 });
    xs(sh.getRange(row, 2), { bg: rowBg, sz: 9, val: s.goal || '', wrap: true, va: 'middle', border: true, borderColor: XL.GRAY_200 });
    xs(sh.getRange(row, 3), { bg: rowBg, sz: 9, val: s.startDate || '', ha: 'center', va: 'middle', border: true, borderColor: XL.GRAY_200 });
    xs(sh.getRange(row, 4), { bg: rowBg, sz: 9, val: s.endDate || '', ha: 'center', va: 'middle', border: true, borderColor: XL.GRAY_200 });
    xs(sh.getRange(row, 5), { bg: rowBg, bold: true, sz: 10, val: dur, ha: 'center', va: 'middle', border: true, borderColor: XL.GRAY_200 });
    xs(sh.getRange(row, 6), { bg: XL.KIPI_BLUE, fg: XL.WHITE, bold: true, sz: 12, val: sp, ha: 'center', va: 'middle', border: true, borderColor: XL.GRAY_200 });
    xs(sh.getRange(row, 7), { bg: rowBg, sz: 9, val: (s.storyKeys || []).length + ' stories', ha: 'center', va: 'middle', border: true, borderColor: XL.GRAY_200 });
    xs(sh.getRange(row, 8), { bg: rowBg, sz: 8, val: epicNames, wrap: true, va: 'middle', border: true, borderColor: XL.GRAY_200 });
    xs(sh.getRange(row, 9), { bg: rowBg, bold: true, sz: 9, val: cumSP + ' SP (' + pct + '%)', ha: 'center', va: 'middle', border: true, borderColor: XL.GRAY_200 });
    xs(sh.getRange(row, 10), { bg: statusBg, sz: 9, val: statusVal, ha: 'center', va: 'middle', bold: isLast, border: true, borderColor: XL.GRAY_200 });
    row++;
  });
  rh(sh, row, 26);
  xs(sh.getRange(row, 1, 1, 5).merge(), { bg: XL.KIPI_BLUE, fg: XL.WHITE, bold: true, sz: 10, val: 'TOTAL', ha: 'right', va: 'middle' });
  xs(sh.getRange(row, 6), { bg: XL.KIPI_BLUE, fg: XL.WHITE, bold: true, sz: 12, val: totalSP, ha: 'center', va: 'middle' });
  xs(sh.getRange(row, 7), { bg: XL.KIPI_BLUE, fg: XL.WHITE, bold: true, sz: 10, val: sprints.reduce(function (a, s) { return a + (s.storyKeys || []).length; }, 0) + ' stories', ha: 'center', va: 'middle' });
  for (var c = 8; c <= 10; c++) xs(sh.getRange(row, c), { bg: XL.KIPI_BLUE, fg: XL.WHITE, val: '', border: true, borderColor: XL.KIPI_BLUE });
  [100, 260, 100, 100, 120, 100, 100, 180, 130, 120].forEach(function (w, i) { sh.setColumnWidth(i + 1, w); });
}

function xlBuildCapacityPlanner(ss, plan) {
  var sh = ss.insertSheet('Capacity Planning');
  sh.setHiddenGridlines(false);
  rh(sh, 1, 40);
  xs(sh.getRange(1, 1, 1, 9).merge(), { bg: XL.KIPI_BLUE, fg: XL.WHITE, bold: true, sz: 14, val: 'CAPACITY PLANNING  —  Team Capacity vs Planned Story Points', ha: 'center', va: 'middle', ff: 'Arial' });
  rh(sh, 2, 20);
  xs(sh.getRange(2, 1, 1, 9).merge(), { bg: XL.KIPI_GRAY, sz: 9, val: 'Adjust Team Size, SP/Dev and Buffer % in the Settings block to recalculate utilisation', ha: 'center', va: 'middle' });
  rh(sh, 3, 8); sh.getRange(3, 1, 1, 9).merge().setBackground(XL.GRAY_200);
  rh(sh, 4, 22);
  xs(sh.getRange(4, 1, 1, 9).merge(), { bg: XL.KIPI_BLUE, fg: XL.WHITE, bold: true, sz: 10, val: '⚙  CAPACITY SETTINGS  (Edit the yellow cells)', va: 'middle' });
  rh(sh, 5, 24);
  ['Team Size (devs)', 'SP per Dev per Sprint', 'Buffer %', 'Effective Team Capacity (SP)'].forEach(function (h, i) {
    xs(sh.getRange(5, i * 2 + 1), { bg: XL.KIPI_GRAY, bold: true, sz: 9, val: h, ha: 'center', va: 'middle', border: true, borderColor: XL.GRAY_200 });
  });
  rh(sh, 6, 26);
  [5, 10, 15, '=A6*C6*(1-E6/100)'].forEach(function (v, i) {
    sh.getRange(6, i * 2 + 1).setValue(v).setBackground('#FFFDE7').setFontWeight('bold').setHorizontalAlignment('center').setFontSize(11)
      .setBorder(true, true, true, true, false, false, XL.GRAY_200, SpreadsheetApp.BorderStyle.SOLID);
  });
  rh(sh, 7, 10); sh.getRange(7, 1, 1, 9).merge().setBackground(XL.GRAY_200);
  rh(sh, 8, 24);
  ['Sprint', 'Sprint Goal', 'Start Date', 'End Date', 'Planned SP', 'Team Capacity (SP)', 'Utilisation %', 'Remaining SP', 'Status'].forEach(function (h, i) {
    xs(sh.getRange(8, i + 1), { bg: XL.KIPI_GRAY, bold: true, sz: 9, val: h, ha: 'center', va: 'middle', border: true, borderColor: XL.GRAY_200 });
  });
  var sprints = plan.sprints || [], teamCap = Math.round(5 * 10 * (1 - 0.15)), row = 9;
  sprints.forEach(function (s, i) {
    var planned = s.totalStoryPoints || 0, util = teamCap > 0 ? Math.round(planned / teamCap * 100) : 0, remain = teamCap - planned;
    var statusVal = util > 100 ? '⚠️ Over Capacity' : util > 85 ? '⚡ High Load' : util > 0 ? '✅ On Track' : '○ Not Started';
    var statusBg = util > 100 ? XL.RED_LT : util > 85 ? XL.GOLD_LT : XL.GREEN_LT;
    var rowBg = i % 2 === 0 ? XL.KIPI_BLUE_LT : XL.WHITE;
    rh(sh, row, 26);
    xs(sh.getRange(row, 1), { bg: XL.KIPI_BLUE, fg: XL.WHITE, bold: true, sz: 10, val: 'Sprint ' + s.sprintNumber, ha: 'center', va: 'middle', border: true, borderColor: XL.GRAY_200 });
    xs(sh.getRange(row, 2), { bg: rowBg, sz: 9, val: (s.goal || '').substring(0, 60), wrap: true, va: 'middle', border: true, borderColor: XL.GRAY_200 });
    xs(sh.getRange(row, 3), { bg: rowBg, sz: 9, val: s.startDate || '', ha: 'center', va: 'middle', border: true, borderColor: XL.GRAY_200 });
    xs(sh.getRange(row, 4), { bg: rowBg, sz: 9, val: s.endDate || '', ha: 'center', va: 'middle', border: true, borderColor: XL.GRAY_200 });
    xs(sh.getRange(row, 5), { bg: rowBg, bold: true, sz: 11, val: planned, ha: 'center', va: 'middle', border: true, borderColor: XL.GRAY_200 });
    xs(sh.getRange(row, 6), { bg: rowBg, sz: 10, val: teamCap, ha: 'center', va: 'middle', border: true, borderColor: XL.GRAY_200 });
    xs(sh.getRange(row, 7), { bg: util > 100 ? XL.RED_LT : util > 85 ? XL.GOLD_LT : XL.TEAL_LT, bold: true, sz: 11, val: util + '%', ha: 'center', va: 'middle', border: true, borderColor: XL.GRAY_200 });
    xs(sh.getRange(row, 8), { bg: remain < 0 ? XL.RED_LT : rowBg, sz: 10, val: remain, ha: 'center', va: 'middle', border: true, borderColor: XL.GRAY_200 });
    xs(sh.getRange(row, 9), { bg: statusBg, sz: 9, val: statusVal, ha: 'center', va: 'middle', border: true, borderColor: XL.GRAY_200 });
    row++;
  });
  var totalPlanned = sprints.reduce(function (a, s) { return a + (s.totalStoryPoints || 0); }, 0), totalCap = teamCap * sprints.length;
  var totalUtil = totalCap > 0 ? Math.round(totalPlanned / totalCap * 100) : 0;
  rh(sh, row, 26);
  xs(sh.getRange(row, 1, 1, 4).merge(), { bg: XL.KIPI_BLUE, fg: XL.WHITE, bold: true, sz: 10, val: 'TOTALS', ha: 'center', va: 'middle' });
  xs(sh.getRange(row, 5), { bg: XL.KIPI_BLUE, fg: XL.WHITE, bold: true, sz: 12, val: totalPlanned, ha: 'center', va: 'middle' });
  xs(sh.getRange(row, 6), { bg: XL.KIPI_BLUE, fg: XL.WHITE, bold: true, sz: 12, val: totalCap, ha: 'center', va: 'middle' });
  xs(sh.getRange(row, 7), { bg: XL.KIPI_BLUE, fg: XL.WHITE, bold: true, sz: 12, val: totalUtil + '%', ha: 'center', va: 'middle' });
  xs(sh.getRange(row, 8), { bg: XL.KIPI_BLUE, fg: XL.WHITE, bold: true, sz: 12, val: totalCap - totalPlanned, ha: 'center', va: 'middle' });
  xs(sh.getRange(row, 9), { bg: XL.KIPI_BLUE, fg: XL.WHITE, val: '', ha: 'center', va: 'middle' });
  [100, 260, 100, 100, 110, 130, 110, 110, 130].forEach(function (w, i) { sh.setColumnWidth(i + 1, w); });
}

function xlBuildVelocityTracker(ss, plan) {
  var sh = ss.insertSheet('Velocity Tracker');
  sh.setHiddenGridlines(false);
  rh(sh, 1, 40);
  xs(sh.getRange(1, 1, 1, 8).merge(), { bg: XL.KIPI_BLUE, fg: XL.WHITE, bold: true, sz: 14, val: 'VELOCITY TRACKER  —  Sprint Velocity Trends & Burndown Forecast', ha: 'center', va: 'middle', ff: 'Arial' });
  rh(sh, 2, 20);
  xs(sh.getRange(2, 1, 1, 8).merge(), { bg: XL.KIPI_GRAY, sz: 9, val: 'Track actual vs planned velocity each sprint', ha: 'center', va: 'middle' });
  rh(sh, 3, 8); sh.getRange(3, 1, 1, 8).merge().setBackground(XL.GRAY_200);
  rh(sh, 4, 24);
  ['Sprint', 'Start Date', 'End Date', 'Planned SP', 'Actual SP (fill in)', 'Cumulative Planned', 'Cumulative Actual', 'vs Average', 'Trend'].forEach(function (h, i) {
    xs(sh.getRange(4, i + 1), { bg: XL.KIPI_GRAY, bold: true, sz: 9, val: h, ha: 'center', va: 'middle', border: true, borderColor: XL.GRAY_200 });
  });
  var sprints = plan.sprints || [], pts = sprints.map(function (s) { return s.totalStoryPoints || 0; });
  var avg = pts.length ? Math.round(pts.reduce(function (a, b) { return a + b; }, 0) / pts.length) : 0, cumP = 0, row = 5;
  sprints.forEach(function (s, i) {
    var sp = s.totalStoryPoints || 0; cumP += sp;
    var vs = sp - avg, trend = i > 0 ? (sp > pts[i - 1] ? '▲ Up' : sp < pts[i - 1] ? '▼ Down' : '→ Flat') : '→ Flat';
    var trendBg = trend.indexOf('Up') > -1 ? XL.GREEN_LT : trend.indexOf('Down') > -1 ? XL.RED_LT : XL.GOLD_LT;
    var rowBg = i % 2 === 0 ? XL.KIPI_BLUE_LT : XL.WHITE;
    rh(sh, row, 26);
    xs(sh.getRange(row, 1), { bg: XL.KIPI_BLUE, fg: XL.WHITE, bold: true, sz: 10, val: 'Sprint ' + s.sprintNumber, ha: 'center', va: 'middle', border: true, borderColor: XL.GRAY_200 });
    xs(sh.getRange(row, 2), { bg: rowBg, sz: 9, val: s.startDate || '', ha: 'center', va: 'middle', border: true, borderColor: XL.GRAY_200 });
    xs(sh.getRange(row, 3), { bg: rowBg, sz: 9, val: s.endDate || '', ha: 'center', va: 'middle', border: true, borderColor: XL.GRAY_200 });
    xs(sh.getRange(row, 4), { bg: rowBg, bold: true, sz: 11, val: sp, ha: 'center', va: 'middle', border: true, borderColor: XL.GRAY_200 });
    sh.getRange(row, 5).setValue(s.state === 'closed' ? sp : '').setBackground('#FFFDE7').setBorder(true, true, true, true, false, false, XL.GRAY_200, SpreadsheetApp.BorderStyle.SOLID).setHorizontalAlignment('center').setFontSize(11);
    xs(sh.getRange(row, 6), { bg: rowBg, sz: 10, val: cumP, ha: 'center', va: 'middle', border: true, borderColor: XL.GRAY_200 });
    sh.getRange(row, 7).setValue('').setBackground(rowBg).setBorder(true, true, true, true, false, false, XL.GRAY_200, SpreadsheetApp.BorderStyle.SOLID);
    xs(sh.getRange(row, 8), { bg: vs >= 0 ? XL.GREEN_LT : XL.RED_LT, bold: true, sz: 10, val: (vs >= 0 ? '+' : '') + vs + ' SP', ha: 'center', va: 'middle', border: true, borderColor: XL.GRAY_200 });
    xs(sh.getRange(row, 9), { bg: trendBg, bold: true, sz: 9, val: trend, ha: 'center', va: 'middle', border: true, borderColor: XL.GRAY_200 });
    row++;
  });
  rh(sh, row, 30);
  xs(sh.getRange(row, 1, 1, 3).merge(), { bg: XL.GOLD, fg: XL.WHITE, bold: true, sz: 10, val: 'AVG VELOCITY', ha: 'center', va: 'middle' });
  xs(sh.getRange(row, 4), { bg: XL.GOLD_LT, bold: true, sz: 12, val: avg + ' SP', ha: 'center', va: 'middle' });
  xs(sh.getRange(row, 5, 1, 5).merge(), { bg: XL.GOLD_LT, sz: 9, val: 'Fill in "Actual SP" column (yellow) after each sprint', va: 'middle', wrap: true });
  [110, 120, 100, 130, 130, 140, 130, 100, 90].forEach(function (w, i) { sh.setColumnWidth(i + 1, w); });
}

function xlBuildRiskMatrix(ss, plan) {
  var sh = ss.insertSheet('Risk Matrix');
  sh.setHiddenGridlines(false);
  rh(sh, 1, 40);
  xs(sh.getRange(1, 1, 1, 7).merge(), { bg: XL.RED, fg: XL.WHITE, bold: true, sz: 14, val: 'RISK MATRIX  —  Probability vs Impact Analysis', ha: 'center', va: 'middle', ff: 'Arial' });
  rh(sh, 2, 20);
  xs(sh.getRange(2, 1, 1, 7).merge(), { bg: XL.KIPI_GRAY, sz: 9, val: 'CRITICAL  |  HIGH  |  MEDIUM  |  LOW  risk prioritisation', ha: 'center', va: 'middle' });
  rh(sh, 3, 8); sh.getRange(3, 1, 1, 7).merge().setBackground(XL.GRAY_200);
  rh(sh, 4, 22);
  ['#', 'Risk Description', 'Mitigation Strategy', 'Probability', 'Impact', 'Priority', 'Owner'].forEach(function (h, i) {
    xs(sh.getRange(4, i + 1), { bg: XL.KIPI_GRAY, bold: true, sz: 9, val: h, ha: 'center', va: 'middle', border: true, borderColor: XL.GRAY_200 });
  });
  var prioList = ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'];
  var prioColors = { CRITICAL: XL.RED, HIGH: XL.GOLD, MEDIUM: XL.KIPI_BLUE, LOW: XL.GREEN };
  var row = 5;
  (plan.raidLog && plan.raidLog.risks || []).forEach(function (r, i) {
    var prio = prioList[i % prioList.length], prioBg = prioColors[prio], rowBg = i % 2 === 0 ? XL.RED_LT : XL.WHITE;
    rh(sh, row, 40);
    xs(sh.getRange(row, 1), { bg: XL.RED, fg: XL.WHITE, bold: true, val: i + 1, ha: 'center', va: 'middle', border: true, borderColor: XL.GRAY_200 });
    xs(sh.getRange(row, 2), { bg: rowBg, sz: 9, val: r.description || '', wrap: true, va: 'middle', border: true, borderColor: XL.GRAY_200 });
    xs(sh.getRange(row, 3), { bg: rowBg, sz: 9, val: r.mitigation || '', wrap: true, va: 'middle', border: true, borderColor: XL.GRAY_200 });
    xs(sh.getRange(row, 4), { bg: rowBg, sz: 9, val: 'Medium', ha: 'center', va: 'middle', border: true, borderColor: XL.GRAY_200 });
    xs(sh.getRange(row, 5), { bg: rowBg, sz: 9, val: 'High', ha: 'center', va: 'middle', border: true, borderColor: XL.GRAY_200 });
    xs(sh.getRange(row, 6), { bg: prioBg, fg: XL.WHITE, bold: true, sz: 9, val: prio, ha: 'center', va: 'middle', border: true, borderColor: XL.GRAY_200 });
    xs(sh.getRange(row, 7), { bg: rowBg, sz: 9, val: 'Client', ha: 'center', va: 'middle', border: true, borderColor: XL.GRAY_200 });
    row++;
  });
  for (var b = 0; b < 3; b++) {
    rh(sh, row, 28);
    for (var c = 1; c <= 7; c++) sh.getRange(row, c).setBackground(XL.WHITE).setBorder(true, true, true, true, false, false, XL.GRAY_200, SpreadsheetApp.BorderStyle.SOLID);
    sh.getRange(row, 1).setValue((row - 4) + '.').setHorizontalAlignment('center');
    row++;
  }
  [50, 260, 220, 100, 100, 110, 120].forEach(function (w, i) { sh.setColumnWidth(i + 1, w); });
}

function xlBuildChartData(ss, plan) {
  var sh = ss.insertSheet('Chart Data');
  sh.setHiddenGridlines(false);
  rh(sh, 1, 36);
  xs(sh.getRange(1, 1, 1, 5).merge(), { bg: XL.KIPI_BLUE, fg: XL.WHITE, bold: true, sz: 12, val: 'CHART DATA  —  Source data for charts & visualisations', ha: 'center', va: 'middle', ff: 'Arial' });
  rh(sh, 2, 8); sh.getRange(2, 1, 1, 5).merge().setBackground(XL.GRAY_200);
  var row = 3;
  xs(sh.getRange(row, 1, 1, 3).merge(), { bg: XL.KIPI_BLUE, fg: XL.WHITE, bold: true, sz: 10, val: 'VELOCITY DATA', va: 'middle' }); rh(sh, row, 20); row++;
  ['Sprint', 'Planned SP', 'Cumulative SP'].forEach(function (h, i) { xs(sh.getRange(row, i + 1), { bg: XL.KIPI_GRAY, bold: true, sz: 9, val: h }); }); row++;
  var cum = 0;
  (plan.sprints || []).forEach(function (s) {
    cum += (s.totalStoryPoints || 0);
    sh.getRange(row, 1).setValue('Sprint ' + s.sprintNumber);
    sh.getRange(row, 2).setValue(s.totalStoryPoints || 0);
    sh.getRange(row, 3).setValue(cum);
    row++;
  });
  row += 2;
  xs(sh.getRange(row, 1, 1, 3).merge(), { bg: XL.KIPI_BLUE, fg: XL.WHITE, bold: true, sz: 10, val: 'EPIC BREAKDOWN', va: 'middle' }); rh(sh, row, 20); row++;
  ['Epic', 'Story Points', 'Stories'].forEach(function (h, i) { xs(sh.getRange(row, i + 1), { bg: XL.KIPI_GRAY, bold: true, sz: 9, val: h }); }); row++;
  (plan.epics || []).forEach(function (e) {
    var sp = (e.stories || []).reduce(function (a, s) { return a + (s.storyPoints || 0); }, 0);
    sh.getRange(row, 1).setValue((e.summary || '').substring(0, 40));
    sh.getRange(row, 2).setValue(sp);
    sh.getRange(row, 3).setValue((e.stories || []).length);
    row++;
  });
  row += 2;
  var raid = plan.raidLog || {};
  xs(sh.getRange(row, 1, 1, 3).merge(), { bg: XL.KIPI_BLUE, fg: XL.WHITE, bold: true, sz: 10, val: 'RAID SUMMARY', va: 'middle' }); rh(sh, row, 20); row++;
  [['Risks', (raid.risks || []).length], ['Issues', (raid.issues || []).length],
  ['Assumptions', (raid.assumptions || []).length], ['Dependencies', (raid.dependencies || []).length]].forEach(function (d) {
    sh.getRange(row, 1).setValue(d[0]); sh.getRange(row, 2).setValue(d[1]); row++;
  });
  [180, 120, 120, 120].forEach(function (w, i) { sh.setColumnWidth(i + 1, w); });
}

function xlBuildSmartEstimator(ss, plan) {
  var sh = ss.insertSheet('Smart Estimator');
  sh.setHiddenGridlines(false);
  rh(sh, 1, 40);
  xs(sh.getRange(1, 1, 1, 4).merge(), { bg: XL.KIPI_BLUE, fg: XL.WHITE, bold: true, sz: 14, val: 'SMART COMPLETION ESTIMATOR  —  AI-Powered Delivery Forecast', ha: 'center', va: 'middle', ff: 'Arial' });
  rh(sh, 2, 20);
  xs(sh.getRange(2, 1, 1, 4).merge(), { bg: XL.KIPI_GRAY, sz: 9, val: 'Buffered delivery forecast based on velocity, story points and risk count', ha: 'center', va: 'middle' });
  rh(sh, 3, 8); sh.getRange(3, 1, 1, 4).merge().setBackground(XL.GRAY_200);
  var sprints = plan.sprints || [];
  var totalSP = (plan.epics || []).reduce(function (a, e) { return a + (e.stories || []).reduce(function (b, s) { return b + (s.storyPoints || 0); }, 0); }, 0);
  var pts = sprints.map(function (s) { return s.totalStoryPoints || 0; });
  var avg = pts.length ? Math.round(pts.reduce(function (a, b) { return a + b; }, 0) / pts.length) : 20;
  var spNeeded = avg > 0 ? Math.ceil(totalSP / avg) : 0, weeks = spNeeded * 3;
  var riskCount = (plan.raidLog && plan.raidLog.risks) ? plan.raidLog.risks.length : 0;
  var buf = Math.min(50, riskCount * 5 + 10), bufWeeks = Math.ceil(weeks * (1 + buf / 100));
  var done = new Date(); done.setDate(done.getDate() + bufWeeks * 7);
  var row = 4;
  var estRows = [
    ['📦  Total Story Points', totalSP, XL.E1],
    ['⚡  Average Velocity', avg + ' SP / sprint', XL.E2],
    ['🗓  Sprints Required', spNeeded, XL.E3],
    ['📅  Base Duration', weeks + ' weeks', XL.E4],
    ['⚠️  Risk Count', riskCount + ' risks identified', riskCount > 5 ? XL.RED : XL.GOLD],
    ['🛡  Risk Buffer Applied', buf + '%', XL.E5],
    ['📆  Buffered Duration', bufWeeks + ' weeks', XL.E6],
    ['🏁  Projected Completion', done.toLocaleDateString('en', { month: 'long', day: 'numeric', year: 'numeric' }), XL.TEAL],
    ['📥  Data Source', plan.importedFromJira ? 'Imported from Jira (' + plan.importedProjectKey + ')' : 'AI Generated from BRD/SOW', XL.KIPI_BLUE]
  ];
  estRows.forEach(function (e) {
    rh(sh, row, 36);
    xs(sh.getRange(row, 1), { bg: e[2], fg: XL.WHITE, bold: true, sz: 10, val: e[0], va: 'middle' });
    xs(sh.getRange(row, 2, 1, 3).merge(), { bg: XL.GRAY_100, bold: true, sz: 13, val: e[1], ha: 'center', va: 'middle' });
    row++;
  });
  [260, 160, 100, 100].forEach(function (w, i) { sh.setColumnWidth(i + 1, w); });
}

// ==================== EXCEL EXPORT WRAPPERS ====================
function exportCurrentPlanToExcel() {
  var sheet = SpreadsheetApp.getActiveSheet();
  if (!sheet.getName().startsWith('Review_')) { SpreadsheetApp.getUi().alert('Please open a Review_ sheet first.'); return; }
  var planId = sheet.getRange('H1').getValue();
  if (!planId) { SpreadsheetApp.getUi().alert('Could not find Plan ID.'); return; }
  var result = exportPlanToExcelInternal(planId);
  if (result.success) {
    var html = '<html><body style="font-family:sans-serif;padding:24px"><h3>Excel Export Ready</h3>' +
      '<a href="' + result.downloadUrl + '" target="_blank" style="display:inline-block;margin-top:12px;padding:12px 28px;background:#3b6be8;color:#fff;border-radius:8px;text-decoration:none;font-weight:bold">Download Excel</a>' +
      '<p style="margin-top:20px"><button onclick="google.script.host.close()" style="padding:8px 20px;cursor:pointer;">Close</button></p></body></html>';
    SpreadsheetApp.getUi().showModalDialog(HtmlService.createHtmlOutput(html).setWidth(380).setHeight(200), 'Export Complete');
  } else {
    SpreadsheetApp.getUi().alert('Export failed:\n' + result.error);
  }
}

function exportPlanToExcelFromUI(planId) { return exportPlanToExcelInternal(planId); }

function exportPlanToExcelInternal(planId) {
  try {
    var ss = SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
    var plansSheet = ss.getSheetByName('ProjectPlans');
    if (!plansSheet) throw new Error('ProjectPlans sheet not found');
    var planRow = findPlanRow(plansSheet, planId);
    if (!planRow) throw new Error('Plan ID not found: ' + planId);
    var planJson = plansSheet.getRange(planRow, 3).getValue();
    if (!planJson) throw new Error('Plan data is empty');

    var projectPlan = GUARD.scrubP2(JSON.parse(planJson));
    var tempName = 'BRD_Export_' + planId.substring(0, 8) + '_' + Date.now();
    var tempSS = SpreadsheetApp.create(tempName);
    Utilities.sleep(600);

    xlBuildCover(tempSS, projectPlan, planId);
    xlBuildDashboard(tempSS, projectPlan);
    xlBuildEpics(tempSS, projectPlan);
    xlBuildSprints(tempSS, projectPlan);
    xlBuildGantt(tempSS, projectPlan);
    xlBuildVelocityTracker(tempSS, projectPlan);
    xlBuildCapacityPlanner(tempSS, projectPlan);
    xlBuildRaid(tempSS, projectPlan);
    xlBuildRiskMatrix(tempSS, projectPlan);
    xlBuildTests(tempSS, projectPlan);
    xlBuildChartData(tempSS, projectPlan);
    xlBuildSmartEstimator(tempSS, projectPlan);

    var defaultSheet = tempSS.getSheetByName('Sheet1');
    if (defaultSheet && tempSS.getSheets().length > 1) tempSS.deleteSheet(defaultSheet);

    SpreadsheetApp.flush();
    Utilities.sleep(2000);

    var excelBlob = exportToXlsxBlob(tempSS.getId());
    var excelFile = DriveApp.createFile(excelBlob);
    excelFile.setName('ProjectPlan_' + planId.substring(0, 8) + '.xlsx');
    try { DriveApp.getFileById(tempSS.getId()).setTrashed(true); } catch (e) { }

    return { success: true, downloadUrl: excelFile.getDownloadUrl() };
  } catch (err) {
    Logger.log('exportPlanToExcelInternal error: ' + err.toString());
    return { success: false, error: err.toString() };
  }
}

function exportToXlsxBlob(spreadsheetId) {
  var token = ScriptApp.getOAuthToken();
  var exportUrl = 'https://docs.google.com/spreadsheets/d/' + spreadsheetId + '/export?format=xlsx';
  for (var attempt = 1; attempt <= 3; attempt++) {
    var response = UrlFetchApp.fetch(exportUrl, { headers: { Authorization: 'Bearer ' + token }, muteHttpExceptions: true });
    if (response.getResponseCode() === 200) {
      var blob = response.getBlob();
      blob.setContentType('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      blob.setName('export.xlsx');
      return blob;
    }
    if (attempt < 3) Utilities.sleep(2000 * attempt);
  }
  throw new Error('Failed to export xlsx after 3 attempts.');
}

// ==================== MENU ====================
function onOpen() {
  SpreadsheetApp.getUi().createMenu('BRD AI Engine')
    .addItem('Open Upload UI', 'openUploadUI')
    .addSeparator()
    .addItem('Export Current Plan to Excel', 'exportCurrentPlanToExcel')
    .addSeparator()
    .addItem('View API Usage', 'showAPIUsage')
    .addToUi();
}

function openUploadUI() {
  var url = ScriptApp.getService().getUrl();
  var html = '<html><body style="font-family:sans-serif;padding:20px">' +
    '<h3>BRD AI Engine v4</h3>' +
    '<a href="' + url + '" target="_blank" style="display:inline-block;padding:12px 24px;background:#3b6be8;color:#fff;border-radius:8px;text-decoration:none;font-weight:bold">Open BRD AI Engine →</a>' +
    '<button onclick="google.script.host.close()" style="display:block;margin-top:16px;padding:8px 16px;cursor:pointer">Close</button>' +
    '</body></html>';
  SpreadsheetApp.getUi().showModalDialog(HtmlService.createHtmlOutput(html).setWidth(400).setHeight(200), 'Open UI');
}

function showAPIUsage() {
  var usage = getAPIUsage();
  var msg = 'API Token Usage:\n\nPlan Generation (Key 1): ' + usage.apiKey1.totalTokens.toLocaleString() + ' tokens\n' +
    'Test Generation (Key 2): ' + usage.apiKey2.totalTokens.toLocaleString() + ' tokens\n' +
    'Total: ' + (usage.apiKey1.totalTokens + usage.apiKey2.totalTokens).toLocaleString() + ' tokens';
  SpreadsheetApp.getUi().alert(msg);
}
