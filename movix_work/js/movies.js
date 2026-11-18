
// MOVIX sample catalogue + Supabase live catalogue loader.

window.MOVIX_MOVIES = [
  {id:1,title:"The Last Horizon",year:2026,genre:"Action",type:"Movie",image:"https://images.unsplash.com/photo-1519608487953-e999c86e7455?auto=format&fit=crop&w=700&q=85",progress:68},
  {id:2,title:"Midnight Run",year:2025,genre:"Thriller",type:"Movie",image:"https://images.unsplash.com/photo-1500530855697-b586d89ba3ee?auto=format&fit=crop&w=700&q=85",progress:32},
  {id:3,title:"Beyond Earth",year:2026,genre:"Sci-Fi",type:"Movie",image:"https://images.unsplash.com/photo-1462331940025-496dfbfc7564?auto=format&fit=crop&w=700&q=85",progress:0},
  {id:4,title:"The Silent City",year:2024,genre:"Drama",type:"Movie",image:"https://images.unsplash.com/photo-1511818966892-d7d671e672a2?auto=format&fit=crop&w=700&q=85",progress:0},
  {id:5,title:"Wild Frontier",year:2025,genre:"Adventure",type:"Movie",image:"https://images.unsplash.com/photo-1470770841072-f978cf4d019e?auto=format&fit=crop&w=700&q=85",progress:54},
  {id:6,title:"Red Signal",year:2026,genre:"Action",type:"Movie",image:"https://images.unsplash.com/photo-1518709268805-4e9042af9f23?auto=format&fit=crop&w=700&q=85",progress:0},
  {id:7,title:"Blue Hour",year:2025,genre:"Drama",type:"Series",image:"https://images.unsplash.com/photo-1470252649378-9c29740c9fa8?auto=format&fit=crop&w=700&q=85",progress:0},
  {id:8,title:"Deep Space",year:2024,genre:"Sci-Fi",type:"Series",image:"https://images.unsplash.com/photo-1446776811953-b23d57bd21aa?auto=format&fit=crop&w=700&q=85",progress:0}
];

window.MOVIX_LOAD_CATALOGUE = async function () {
  const client = window.MOVIX_AUTH?.client;

  if (!client) {
    throw new Error("Supabase client is not available.");
  }

  const [movieResult, seriesResult] = await Promise.all([
    client.from("movies").select(
      "id,title,description,release_year,poster_url,movie_genres(genres(name))"
    ),
    client.from("series").select(
      "id,title,description,release_year,poster_url,series_genres(genres(name))"
    )
  ]);

  if (movieResult.error) throw movieResult.error;
  if (seriesResult.error) throw seriesResult.error;

  const oldCatalogue = window.MOVIX_MOVIES;

  function convert(row, type, index) {
    const old = oldCatalogue.find(
      item => item.title.toLowerCase() === row.title.toLowerCase()
    );

    const relation = type === "Movie"
      ? row.movie_genres
      : row.series_genres;

    const genres = (relation || [])
      .map(item => item.genres?.name)
      .filter(Boolean);

    return {
      id: old?.id ?? index + 1,
      dbId: row.id,
      title: row.title,
      description: row.description || "",
      year: row.release_year || "",
      genre: genres.join(", ") || "General",
      type,
      image: row.poster_url || old?.image || "",
      progress: old?.progress || 0
    };
  }

  const liveMovies = (movieResult.data || []).map(
    (row, index) => convert(row, "Movie", index)
  );

  const liveSeries = (seriesResult.data || []).map(
    (row, index) => convert(row, "Series", liveMovies.length + index)
  );

  window.MOVIX_MOVIES.splice(
    0,
    window.MOVIX_MOVIES.length,
    ...liveMovies,
    ...liveSeries
  );

  console.log("MOVIX live catalogue loaded:", {
    movies: liveMovies.length,
    series: liveSeries.length
  });

  return true;
};
