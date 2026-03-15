import { NextRequest, NextResponse } from "next/server";
import { cities } from "@/data/cities";

// GET - Search cities
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const query = searchParams.get("q") || "";
    const limit = parseInt(searchParams.get("limit") || "20");

    if (!query || query.length < 1) {
      return NextResponse.json([]);
    }

    const queryLower = query.toLowerCase();
    
    const results = cities
      .filter(city => city.name.toLowerCase().startsWith(queryLower))
      .slice(0, limit)
      .map(city => ({
        name: city.name,
        region: city.region,
        country: city.country,
        fullName: `${city.name}${city.region ? ` (${city.region})` : ""}, ${city.country}`
      }));

    return NextResponse.json(results);
  } catch (error) {
    console.error("Search cities error:", error);
    return NextResponse.json([], { status: 500 });
  }
}
