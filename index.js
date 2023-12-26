require("dotenv").config();
const express = require("express");
const morgan = require("morgan");
const path = require("path");
const mongoose = require("mongoose");
const Models = require("./models.js");
const Movies = Models.Movie;
const Users = Models.User;
const { MongoClient } = require("mongodb");
const { log } = require("console");
const passport = require("passport");
let pass = require("./passport.js");
const { check, validationResult } = require("express-validator");

const bodyParser = require("body-parser");

// Initialize Express app
const app = express();
const cors = require("cors");
app.use(cors());

const auth = require("./auth.js")(app);
const port = process.env.PORT || 8080;
app.use(express.static(path.join(__dirname, "public")));

// MongoDB connection URL and Database Name
app.use(bodyParser.json());
mongoose.set("strictQuery", false);
const connectDB = async () => {
  try {
    const conn = await mongoose.connect(process.env.MONGO_URI, {
      dbName: "cfDB",
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });
    console.log(`mongoDB Connected: ${conn.connection.host}`);
  } catch (error) {
    console.log(error);
    process.exit(1);
  }
};

// Middleware to log HTTP requests
app.use(morgan("common"));
app.use(express.json());

// Function to make the first letter of every word caps (title case)
const titleCase = (string) => {
  if (!string) return string;
  return string
    .split(" ")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(" ");
};

// Route to serve the index.html file
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"), (err) => {
    if (err) {
      console.error(err);
      res.status(500).send("An error has occurred");
    }
  });
});

// Route to serve the documentation.html file
app.get("/documentation", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "documentation.html"));
});

//---------- GET Requests ------------

// Route to get all movies from the database
app.get("/movies", async (req, res) => {
  try {
    await Movies.find().then((movies) => {
      res.status(200).json(movies);
    });
  } catch (e) {
    console.error(e);
    res.status(500).send("Error: " + e);
  }
});

// Route to get a single movie by title
app.get(
  "/movies/:title",
  passport.authenticate("jwt", { session: false }),
  async (req, res) => {
    try {
      await Movies.findOne({ Title: titleCase(req.params.title) }).then(
        (movie) => {
          if (movie) {
            res.status(200).json(movie);
          } else {
            res.status(404).send("Movie title not found");
          }
        }
      );
    } catch (e) {
      console.error(err);
      res.status(500).send("Error fetching movie from database.");
    }
  }
);

// Route to get movie by genre
app.get(
  "/movies/genre/:genrename",
  passport.authenticate("jwt", { session: false }),
  async (req, res) => {
    try {
      await Movies.where("Genre.Name")
        .equals(titleCase(req.params.genrename))
        .then((movies) => {
          if (movies.length > 0) {
            res.status(200).json(movies);
          } else {
            res.status(404).send("Genre Name not found");
          }
        });
    } catch (e) {
      console.error(err);
      res.status(500).send("Error fetching movie from database.");
    }
  }
);

// Route to get movie by director
app.get(
  "/movies/director/:directorname",
  passport.authenticate("jwt", { session: false }),
  async (req, res) => {
    try {
      await Movies.where("Director.Name")
        .equals(titleCase(req.params.directorname))
        .then((movies) => {
          if (movies.length > 0) {
            res.status(200).json(movies);
          } else {
            res.status(404).send("Director Name not found");
          }
        });
    } catch (e) {
      console.error(err);
      res.status(500).send("Error fetching movie from database.");
    }
  }
);

// Route to get all users from the database
app.get(
  "/users",
  passport.authenticate("jwt", { session: false }),
  async (req, res) => {
    try {
      await Users.find().then((users) => {
        res.status(200).json(users);
      });
    } catch (e) {
      console.error(err);
      res.status(500).send("Error fetching users from database.");
    }
  }
);

// Route to get a user by username
app.get(
  "/users/:Username",
  passport.authenticate("jwt", { session: false }),
  async (req, res) => {
    try {
      await Users.where("Username")
        .equals(req.params.Username)
        .then((user) => {
          if (user.length > 0) {
            res.status(200).json(user);
          } else {
            res.status(404).send("Username not found");
          }
        });
    } catch (e) {
      console.error(e);
      res.status(500).send("Error fetching users from database.");
    }
  }
);
//--------- POST Requests -------------

// Route to add a new user
app.post(
  "/users",
  [
    check("Username", "Username is required").isLength({ min: 5 }),
    check(
      "Username",
      "Username contains non alphanumeric characters - not allowed."
    ).isAlphanumeric(),
    check("Password", "Password is required").not().isEmpty(),
    check("Email", "Email does not appear to be valid").isEmail(),
  ],
  async (req, res) => {
    // check the validation object for errors
    let errors = validationResult(req);

    if (!errors.isEmpty()) {
      return res.status(422).json({ errors: errors.array() });
    }

    let hashedPassword = Users.hashPassword(req.body.Password);
    await Users.findOne({ Username: req.body.Username }) // Search to see if a user with the requested username already exists
      .then((user) => {
        if (user) {
          //If the user is found, send a response that it already exists
          return res.status(400).send(req.body.Username + " already exists");
        } else {
          Users.create({
            Username: req.body.Username,
            Password: hashedPassword,
            Email: req.body.Email,
            Birthday: req.body.Birthday,
          })
            .then((user) => {
              res.status(201).json(user);
            })
            .catch((error) => {
              console.error(error);
              res.status(500).send("Error: " + error);
            });
        }
      })
      .catch((error) => {
        console.error(error);
        res.status(500).send("Error: " + error);
      });
  }
);
// Add a movie to a user's list of favorites
app.post(
  "/users/:Username/movies/:MovieID",
  passport.authenticate("jwt", { session: false }),
  async (req, res) => {
    try {
      // Find user and update
      const updatedUser = await Users.findOneAndUpdate(
        { Username: req.params.Username },
        { $push: { FavoriteMovies: req.params.MovieID } },
        { new: true, runValidators: true }
      );

      // Check if the user was found and updated
      if (!updatedUser) {
        return res.status(404).send("User not found");
      }

      res.json(updatedUser);
    } catch (err) {
      console.error(err);
      // Send appropriate error messages
      if (err.kind === "ObjectId") {
        return res.status(400).send("Invalid MovieID format");
      }
      res.status(500).send("Error: " + err);
    }
  }
);

//----------- PUT Requests ---------
//Update user
app.put(
  "/users/:Username",
  passport.authenticate("jwt", { session: false }),
  async (req, res) => {
    // CONDITION TO CHECK ADDED HERE
    if (req.user.Username !== req.params.Username) {
      return res.status(400).send("Permission denied");
    }
    // CONDITION ENDS
    await Users.findOneAndUpdate(
      { Username: req.params.Username },
      {
        $set: {
          Username: req.body.Username,
          Password: req.body.Password,
          Email: req.body.Email,
          Birthday: req.body.Birthday,
        },
      },
      { new: true }
    ) // This line makes sure that the updated document is returned
      .then((updatedUser) => {
        res.json(updatedUser);
      })
      .catch((err) => {
        console.log(err);
        res.status(500).send("Error: " + err);
      });
  }
);
//----------- DELETE Requests ------------

// Delete a user by username
app.delete(
  "/users/:Username",
  passport.authenticate("jwt", { session: false }),
  async (req, res) => {
    if (req.user.Username !== req.params.Username) {
      return res.status(403).send("Permission denied");
    }

    try {
      const user = await Users.findOneAndDelete({
        Username: req.params.Username,
      });

      if (!user) {
        res.status(404).send(req.params.Username + " was not found");
      } else {
        res.status(200).send(req.params.Username + " was deleted.");
      }
    } catch (err) {
      console.error(err);
      res.status(500).send("Error: " + err);
    }
  }
);

// Error handling middleware
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).send("Something broke!");
});

connectDB().then(() => {
  app.listen(port, () => {
    console.log(`Listening in port ${port}`);
  });
});
