const mongoose = require('mongoose');
require('dotenv').config();

const movieSchema = new mongoose.Schema({
  title: String,
  videoUrlLow: String,
  videoUrlHigh: String,
  videoQuality: String,
  uploaderName: String,
  thumbnailUrl: String,
  pornstars: [String],
  duration: String,
  views: String,
  comments: String,
  tags: [String],
});

const Movie = mongoose.model('Movie', movieSchema);

const connectDB = async () => {
  const dbUri = process.env.DATABASE_URL;
  if (!dbUri) {
    throw new Error('DATABASE_URL environment variable is not set');
  }
  await mongoose.connect(dbUri);
};

const saveMovie = async (movie) => {
  const newMovie = new Movie(movie);
  await newMovie.save();
};

module.exports = { connectDB, saveMovie };
