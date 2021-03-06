var parsePodcast = require('./node-podcast-parser');
var config = require('../config.json');
var db = require('../db/config.js');
var request = require('request');
var _ = require('lodash');
var Podcast = db.Podcast;
var Content = db.Content;
var Genre = db.Genre;

var saveDescriptions = (url, id) => {
  return new Promise((resolve, reject) => {
    request(url, (err, response, data) => {
      if (err) {
        console.error('Network error', err);
        reject(err);
      }
      parsePodcast(data, (err, feed) => {
      if (err) {
        console.error('Parsing error', err);
        reject(err);
      }
      if (feed) {
        if (feed.title && feed.description.long) {
          var description = (feed.title + ' ' + feed.description.long);
        } else if (feed.title && !feed.description.long) {
          description = (feed.title);
        } else if (!feed.title && feed.description.long) {
          description = (feed.description.long);
        }
      }
      Podcast.findOne({_id: id}, (err, podcast) => {
        podcast.description = description;
        podcast.save();
      })
      resolve({description: description, id: id});
      });
    });
  });
};

var getContentAndGenres = function (podcast) {
 return new Promise ((resolve, reject) => {
    var genres = [];
    var content= [];
    Podcast.findOne({name: podcast.name}, (err, record) => {
      if (err) reject (err);
      if(!record){resolve({genres: [], content: []})}
      else {
        genres = genres.concat(record.genres);
        content = content.concat(record.content);
        resolve({genres: genres, content: content});
      }
    });
  });
};

var saveGenres = (genres) => {
  podcast.genres.forEach((genre) => {
   Genre.findOne({genre: genre}, (err, record) => {
      if (err) {console.log(err)};
      if (!record) {
        var newRecord = new Genre({genre: genre, podcasts: [podcast.podcastId]});
        console.log('New genre record created for ' + genre + '!');
        newRecord.save((err) => {if (err) {console.log(err)};})
      } else {
        record.podcasts.push(podcast.podcastId);
        record.podcasts = _.uniq(record.podcasts);
        record.save();
      }
    });
  });
};

var saveContent = (content) => {
  podcast.content.forEach((contentWord) => {
    Content.findOne({content: contentWord}, (err, record) => {
      if (err) {console.log(err)};
      if (!record) {
        var newRecord = new Content({content: contentWord, podcasts: [podcast.podcastId]});
        console.log('New content record created for ' + contentWord + '!');
        newRecord.save((err) => {if (err) handleError(err);})
      } else {
        record.podcasts.push(podcast.podcastId);
        record.podcasts = _.uniq(record.podcasts);
        record.save();
      }
    });
  });
};

var addWords = function (podcast) {
  saveGenres(genre);
  saveContent(content);
};

var getWordCount = (type, array) => {
  if (type = 'genre') {
    genres = {};
    array.forEach((genre) => {
      if (genre in genres) {
        genres[genre]++;
      } else {
        genres[genre] = 1;
      }
    });
    return genres;
  } else if (type = 'content') {
    content = {};
    array.forEach((word) => {
      if (word in content) {
        content[word]++;
      } else {
        content[word] = 1;
      }
    });
    return content;
  }
};

var getContent = function (id, description) {
  var features = { "concepts": { "limit": 10 } }
  var body =  { text: description, features: features }
  var username = config.watsonUsername;
  var password = config.watsonPassword;
  var url = 'https://' + username + ':' + password + config.watsonUrl;
  var options = {
    method: 'POST',
    json: true,
    url: url,
    headers: {
      'content-type': 'application/json'
    },
    body: body
  }
  return new Promise((resolve, reject) => {
    request(options, function (error, response, body) {
      if (error) {
        console.log('getContent Error: ', error);
        reject(error);
      }
      var concepts = [];
      if (response.body.concepts) {
        response.body.concepts.forEach((concept) => {
          if (concept.relevance > 0.6) {
            concepts.push(concept.text);
          }
        });
      }
      resolve(concepts);
    })
  })
};

var addPodcast = function (podcast) {
  var id = null;
  var content = [];
  var podcastRecord = null;
  var genres = podcast.genres;
  var content = [];
  delete podcast.genres;

  return new Promise((resolve, reject) => {
    Podcast.findOne({podcastId: podcast.collectionId})
    .then((record) => {
      if (!record) {
        var newRecord = new Podcast({
          podcastObj: podcast,
          podcastId: podcast.collectionId,
          name: podcast.collectionName,
          genres: genres,
          content: []
        });
        newRecord.save()
        .then(saved => {
          id = saved._id;
          return Podcast.findOne({_id: id})
        })
        .then((record) => {
          podcastRecord = record;
          var url = podcastRecord.podcastObj.feedUrl;
          return saveDescriptions(url, podcastRecord._id)
        })
        .then((data) => getContent(data.id, data.description))
        .then((concepts) => {
          if (concepts.length) {
            content = content.concat(concepts);
            content = _.uniq(content);
            return Podcast.findOne({_id: id})
            .then(podcast => {
              podcastRecord = podcast;
              podcast.content = content;
              podcast.save();
            })
            .then(() => addWords(podcastRecord))
          }
        })
        .then(resolve)
      } else {
        console.log('Record already in database.');
        resolve();
      }
    })
    .catch(reject);
  })
};

module.exports = {
  addPodcast: addPodcast,
  getContentAndGenres: getContentAndGenres,
  getWordCount: getWordCount
}