const express = require('express')
const {open} = require('sqlite')
const path = require('path')
const sqlite3 = require('sqlite3')
const bcrypt = require('bcrypt')
const jwt = require('jsonwebtoken')

let database
const app = express()
app.use(express.json())

const initializeDBandServer = async () => {
  try {
    database = await open({
      filename: path.join(__dirname, 'twitterClone.db'),
      driver: sqlite3.Database,
    })
    app.listen(3000, () => {
      console.log('Server Is Running At http://localhost:3000/')
    })
  } catch (error) {
    console.log(`Database Error ${error.message}`)
    process.exit(1)
  }
}

initializeDBandServer()

app.post('/register/', async (request, response) => {
  const {username, password, name, gender} = request.body
  const checkUser = `SELECT username FROM user WHERE username='${username}';`
  const dbUser = await database.get(checkUser)
  console.log(dbUser)
  if (dbUser !== undefined) {
    response.status(400)
    response.send('User already exists')
  } else {
    if (password.length < 6) {
      response.status(400)
      response.send('Password is too short')
    } else {
      const hashedPassword = await bcrypt.hash(password, 10)
      const requestQuery = `INSERT INTO user(name, username, password, gender) VALUES ('${name}', '${username}', '${hashedPassword}', '${gender}');`
      await database.run(requestQuery)
      response.status(200)
      response.send('User created successfully')
    }
  }
})

app.post('/login/', async (request, response) => {
  const {username, password} = request.body
  const checkUser = `SELECT * FROM user WHERE username='${username}';`
  const dbUserExist = await database.get(checkUser)
  if (dbUserExist !== undefined) {
    const checkPassword = await bcrypt.compare(password, dbUserExist.password)
    if (checkPassword === true) {
      const payload = {username: username}
      const jwtToken = jwt.sign(payload, 'secret_key')
      response.send({jwtToken})
    } else {
      response.status(400)
      response.send('Invalid password')
    }
  } else {
    response.status(400)
    response.send('Invalid user')
  }
})

const authenticationToken = (request, response, next) => {
  let jwtToken
  const authHeader = request.headers['authorization']
  if (authHeader !== undefined) {
    jwtToken = authHeader.split(' ')[1]
  } else {
    response.status(401)
    response.send('Invalid JWT Token')
  }

  if (jwtToken !== undefined) {
    jwt.verify(jwtToken, 'secret_key', async (error, payload) => {
      if (error) {
        response.status(401)
        response.send('Invalid JWT Token')
      } else {
        request.username = payload.username
        next()
      }
    })
  }
}

app.get(
  '/user/tweets/feed/',
  authenticationToken,
  async (request, response) => {
    let {username} = request
    const getUserIdQuery = `SELECT user_id FROM user WHERE username='${username}';`
    const getUserId = await database.get(getUserIdQuery)

    const getFollowerIdsQuery = `SELECT following_user_id FROM follower WHERE follower_user_id=${getUserId.user_id};`
    const getFollowerIds = await database.all(getFollowerIdsQuery)

    const getFollowerIdsSimple = getFollowerIds.map(eachUser => {
      return eachUser.following_user_id
    })

    const getTweetQuery = `SELECT user.username, tweet.tweet, tweet.date_time AS dateTime FROM user INNER JOIN tweet
                          ON user.user_id = tweet.user_id WHERE user.user_id IN (${getFollowerIdsSimple})
                          ORDER BY tweet.date_time DESC LIMIT 4 ;`
    const responseResult = await database.all(getTweetQuery)
    response.send(responseResult)
  },
)

app.get('/user/following/', authenticationToken, async (request, response) => {
  let {username} = request
  const getUserIdQuery = `SELECT user_id FROM user WHERE username='${username}';`
  const getUserId = await database.get(getUserIdQuery)

  const getFollowerIdsQuery = `SELECT following_user_id FROM follower WHERE follower_user_id=${getUserId.user_id};`
  const getFollowerIdsArray = await database.all(getFollowerIdsQuery)

  const getFollowerIds = getFollowerIdsArray.map(eachUser => {
    return eachUser.following_user_id
  })

  const getFollowersResultQuery = `SELECT name FROM user WHERE user_id IN (${getFollowerIds});`
  const responseResult = await database.all(getFollowersResultQuery)
  response.send(responseResult)
})

app.get('/user/followers', authenticationToken, async (request, response) => {
  let {username} = request
  const getUserIdQuery = `SELECT user_id FROM user WHERE username='${username}';`
  const getUserId = await database.get(getUserIdQuery)

  const getFollowerIdsQuery = `SELECT follower_user_id FROM follower WHERE following_user_id=${getUserId.user_id};`
  const getFollowerIdsArray = await database.all(getFollowerIdsQuery)
  console.log(getFollowerIdsArray)
  const getFollowerIds = getFollowerIdsArray.map(eachUser => {
    return eachUser.follower_user_id
  })
  console.log(`${getFollowerIds}`)

  const getFollowersNameQuery = `SELECT name FROM user WHERE user_id IN (${getFollowerIds});`
  const getFollowersName = await database.all(getFollowersNameQuery)
  response.send(getFollowersName)
})

const api6Output = (tweetData, likesCount, replyCount) => {
  return {
    tweet: tweetData.tweet,
    likes: likesCount.likes,
    replies: replyCount.replies,
    dateTime: tweetData.date_time,
  }
}

app.get('/tweets/:tweetId/', authenticationToken, async (request, response) => {
  const {tweetId} = request.params

  let {username} = request
  const getUserIdQuery = `SELECT user_id FROM user WHERE username='${username}';`
  const getUserId = await database.get(getUserIdQuery)

  const getFollowingIdsQuery = `SELECT following_user_id FROM follower WHERE following_user_id=${getUserId.user_id};`
  const getFollowingIdsArray = await database.all(getFollowingIdsQuery)

  const getFollowingIds = getFollowingIdsArray.map(eachFollower => {
    return eachFollower.following_user_id
  })

  const getTweetIdsQuery = `SELECT tweet_id FROM tweet WHERE user_id IN (${getFollowingIds});`
  const getTweetIdsArray = await database.all(getTweetIdsQuery)
  const followingTweetIds = getTweetIdsArray.map(eachId => {
    return eachId.tweet_id
  })

  if (followingTweetIds.includes(parseInt(tweetId))) {
    const likes_count_query = `SELECT COUNT(user_id) AS likes FROM like WHERE tweet_id=${tweetId};`
    const likes_count = await database.get(likes_count_query)

    const reply_count_query = `SELECT COUNT(user_id) AS replies FROM reply WHERE tweet_id=${tweetId};`
    const reply_count = await database.get(reply_count_query)

    const tweet_tweetDateQuery = `SELECT tweet, date_time FROM tweet WHERE tweet_id=${tweetId};`
    const tweet_tweetDate = await database.get(tweet_tweetDateQuery)

    response.send(api6Output(tweet_tweetDate, likes_count, reply_count))
  } else {
    response.status(401)
    response.send('Invalid Request')
    console.log('Invalid Request')
  }
})

const convertLikedUserNameDBObjectToResponseObject = dbObject => {
  return {
    likes: dbObject,
  }
}

app.get(
  '/tweets/:tweetId/likes/',
  authenticationToken,
  async (request, response) => {
    const {tweetId} = request.params

    let {username} = request
    const getUserIdQuery = `SELECT user_id FROM user WHERE username='${username}';`
    const getUserId = await database.get(getUserIdQuery)

    const getFollowingIdsQuery = `SELECT following_user_id FROM follower WHERE following_user_id=${getUserId.user_id};`
    const getFollowingIdsArray = await database.all(getFollowingIdsQuery)

    const getFollowingIds = getFollowingIdsArray.map(eachFollower => {
      return eachFollower.following_user_id
    })

    const getTweetIdsQuery = `SELECT tweet_id FROM tweet WHERE user_id IN (${getFollowingIds});`
    const getTweetIdsArray = await database.all(getTweetIdsQuery)
    const getTweetIds = getTweetIdsArray.map(eachTweet => {
      return eachTweet.tweet_id
    })

    if (getTweetIds.includes(parseInt(tweetId))) {
      const getLikedUserNameQuery = `SELECT user.username AS likes FROM user INNER JOIN like ON
                                    user.user_id=like.user_id WHERE like.tweet_id=${tweetId};`
      const getLikedUserNameArray = await database.all(getLikedUserNameQuery)

      const getLikedUserNames = getLikedUserNameArray.map(eachUser => {
        return eachUser.likes
      })

      response.send(
        convertLikedUserNameDBObjectToResponseObject(getLikedUserNames),
      )
    } else {
      response.status(401)
      response.send('Invalid Request')
    }
  },
)

const converUserNameReplyedDBObjectToResponseObject = dbObject => {
  return {
    replies: dbObject,
  }
}

app.get(
  '/tweets/:tweetId/replies/',
  authenticationToken,
  async (request, response) => {
    const {tweetId} = request.params
    console.log(tweetId)

    let {username} = request
    const getUserIdQuery = `SELECT user_id FROM user WHERE username='${username}';`
    const getUserId = await database.get(getUserIdQuery)

    const getFollowingIdsQuery = `SELECT following_user_id FROM follower WHERE following_user_id=${getUserId.user_id};`
    const getFollowingIdsArray = await database.all(getFollowingIdsQuery)

    const getFollowingIds = getFollowingIdsArray.map(eachFollower => {
      return eachFollower.following_user_id
    })

    const getTweetIdsQuery = `SELECT tweet_id FROM tweet WHERE user_id IN (${getFollowingIds});`
    const getTweetIdsArray = await database.all(getTweetIdsQuery)
    const getTweetIds = getTweetIdsArray.map(eachTweet => {
      return eachTweet.tweet_id
    })

    if (getTweetIds.includes(parseInt(tweetId))) {
      const getUsernameReplyTweetQuery = `SELECT user.name, reply.reply FROM user INNER JOIN reply ON user.user_id=reply.user_id
        WHERE reply.tweet_id=${tweetId}`
      const getUsernameReplyTweets = await database.all(
        getUsernameReplyTweetQuery,
      )

      const responsePayload = {
        tweet: tweetData.tweet,
        replies: getUsernameReplyTweets,
      }
      response.send(responsePayload)

      // response.send(
      //   converUserNameReplyedDBObjectToResponseObject(getUsernameReplyTweets),
      // )
    } else {
      response.status(401)
      response.send('Invalid Request')
    }
  },
)

app.get('/user/tweets/', authenticationToken, async (request, response) => {
  let {username} = request
  const getUserIdQuery = `SELECT user_id FROM user WHERE username='${username}'`
  const getUserId = await database.get(getUserIdQuery)
  console.log(getUserId)

  const getTweetIdsQuery = `SELECT tweet_id FROM tweet WHERE user_id=${getUserId.user_id}`
  const getTweetIdsArray = await database.all(getTweetIdsQuery)
  const getTweetIds = getTweetIdsArray.map(eachId => {
    return parseInt(eachId.tweet_id)
  })
  console.log(getTweetIds)
})

app.post('/user/tweets/', authenticationToken, async (request, response) => {
  let {username} = request
  const getUserIdQuery = `SELECT user_id FROM user WHERE username='${username}';`
  const getUserId = await database.get(getUserIdQuery)

  const {tweet} = request.body

  const currentDate = new Date()
  console.log(currentDate.toISOString().replace('T', ' '))

  const postRequestQuery = `INSERT INTO tweet(tweet, user_id, date_time) VALUES ("${tweet}", "${getUserId.user_id}", "${currentDate.date_time}");`

  const responseResult = await database.run(postRequestQuery)
  const tweet_id = responseResult.lastID
  response.send('Created a Tweet')
})

app.delete(
  '/tweets/:tweetId/',
  authenticationToken,
  async (request, response) => {
    const {tweetId} = request.params

    let {username} = request
    const getUserIdQuery = `SELECT user_id FROM user WHERE username='${username}';`
    const getUserId = await database.get(getUserIdQuery)

    const getUserTweetsListQuery = `SELECT tweet_id FROM tweet WHERE user_id=${getUserId.user_id};`
    const getUserTweetsListArray = await database.all(getUserTweetsListQuery)
    const getUserTweetsList = getUserTweetsListArray.map(eachTweetId => {
      return eachTweetId.tweet_id
    })
    console.log(getUserTweetsList)
    if (getUserTweetsList.includes(parseInt(tweetId))) {
      const deleteTweetsQuery = `DELETE FROM tweet WHERE tweet_id=${tweetId};`
      await database.run(deleteTweetsQuery)
      response.send('Tweet Removed')
    } else {
      response.status(401)
      response.send('Invalid Request')
    }
  },
)

module.exports = app
