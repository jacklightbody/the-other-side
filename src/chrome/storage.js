/*
* User Data is the JSON that we store across all the different browsers
* Format is 
pop-the-bubble-data: {   
    sites: {
        "http://nytimes/an/article": {
            topics: [
                ["article topic 1": 1], 
                ["topic 2": -4]... where 1 and 4 are sentiments
            ]
            timestamp: 121231231231
        }
        "http://nytimes/another/article": {
            topics: [
                ["another topic": 3], 
                ["topic 2": 1]... 
            ]
            timestamp: 1238239864982
        }
    },
    topics: {
        "article topic 1": 1,
        "topic 2": -3,
        "another topic": 3
    },
    ignored {
        topics {
            "ignored topic 1": 0,
            "ignored topic 2": 0 
        }, 
        domains {
            "mail.google.com": 0,
            "myprivatesite.com": 0
        }
    }
    lastCleaned: 121231231230
}
*/
var storageKey = "pop-the-bubble-data";
var baseDS = {sites: {}, topics: {}, lastCleaned: Date.now()};
var storageDefault = {}
storageDefault[storageKey] = baseDS

// simple wrapper for all our functionality to handle the loading and saving of the data
// from and back into chrome storage
function loadSaveData(callback){
    // specify default values here so that if we haven't saved anything yet it doesn't fail
    chrome.storage.local.get(storageDefault, function(el){
        var userData = el[storageKey];
        userData = callback(userData);
        var setData = {}
        setData[storageKey] = userData;
        chrome.storage.local.set(setData, function(){
            console.log("Ignore Preferences Saved Successfully");
            console.log(userData)
        });
    });
}

function getSite(url, callback){
    chrome.storage.local.get(storageDefault, function(el){
        callback(getSiteSentiments(el[storageKey], url));
    });
}

// does the meat of the updating topic sentiments in the right flow
// lets loadSaveData interact with chrome
function updateSiteSentiments(url, sentiments, callback=false){
    loadSaveData(function(userData){
        var userData = el[storageKey];

        // first clean out the old data if needed
        if(userData.lastCleaned < Date.now() - 24 * 60 * 60 * 1000){
            userData = cleanOldData(userData);
            userData.lastCleaned = Date.now();
        }
        // update the data and set it again
        userData = updateUserData(userData, url, sentiments);

        if(callback){
            // at this stage we don't let anything modify our userData
            // but they can use it to update our icon graphics etc.
            callback(getSiteSentiments(userData, url));
        }
        return userData;
    });
}

function getSiteSentiments(userData, url){
    if(siteShouldBeIgnored(userData, url)){
        return [];
    }
    if(url in userData.sites){
        var result = [];
        userData.sites[url].topics.forEach(function(topic){
            result.push([
                topic[0],
                userData.topics[topic[0]]
            ]);
        });
        return result;
    }
    return false;
}
function updateUserData(userData, url, sentiments){
    if(siteShouldBeIgnored(userData, url)){
        return userData;
    }
    if(url in userData.sites){
        userData.sites[url].timestamp = Date.now();
    }else{
        var topicList = Object.keys(sentiments).map(function(key) {
            return [key, sentiments[key]];
        });
        userData = updateTopicSentiments(userData, topicList);
        userData.sites[url] = {topics: topicList, timestamp: Date.now()};
    }
    return userData;
}
function removeSite(userData, url){
    // first reverse the sentiments
    userData = updateTopicSentiments(userData, userData.sites[url].topics, false)
    // and then remove the site from our record
    delete userData.sites[url];
    return userData;
}
function cleanOldData(userData, daysBack = 14){
    var oldTimestamp = Date.now() - (daysBack * 24 * 60 * 60 * 1000);
    Object.keys(userData.sites).forEach(function(url) {
        if(userData.sites[url].timestamp < oldTimestamp){
            // the site was visited more than days back ago
            // so we want to remove it from the record
            userData = removeSite(userData, url);
        }
    });
    return userData
}
// These next few functions are sisters, in that they are triggered when the user ignores an domain or topic
// and we need to go over all our old information and see if any of it needs to be cleaned out
// to reflect this new preference
}
function ignoreDomain(domain){
    loadSaveData(function(userData){
        Object.keys(userData.sites).forEach(function(url) {
            if(URL(url).hostname == domain){
                // the user just told us ignore all data from this domain
                // so we need to remove it 
               userData = removeSite(userData, url)
            }
        });
        return userData;
    });
}
function ignoreTopic(ignoreTopic){
    loadSaveData(function(userData){
        Object.keys(userData.sites).forEach(function(url) {
            Object.keys(userData.sites[url].topics).forEach(function(topic) {
                if(topic == ignoreTopic){
                    delete userData.sites[url][topic];
                }
            });
        });
        Object.keys(userData.topics).forEach(function(topic) {
            if(topic == ignoreTopic){
                delete userData.topics[topic];
            }
        });
        return userData;
    });
}


function updateTopicSentiments(userData, sentiments, add=true){
    var mult = add ? 1 : -1;
    var add;
    var topicName;
    sentiments.forEach(function(el){
        add = mult * el[1];
        topicName = el[0]
        if(topicName in userData.topics){
            userData.topics[topicName] = capSentiment(userData.topics[topicName] + add)
        }else{
            userData.topics[topicName] = add;
        }
    });
    return userData;
}

// Set a cap on how extreme these views can really be
// at a certain point it doesn't actually do much to read one more article
function capSentiment(score, cap){
    return score <= -1 * cap ? -1*min  : score >= cap ? cap : score;
}