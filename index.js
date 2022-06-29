const express = require('express');
const https = require('https')

const app = express();
const PORT = 3000;
const CONCURRENCY = 10;

app.use(express.json());

// Retrieve an object from the Star Wars API.
async function get_star_wars_object(endpoint, index) {

    const star_wars_api_url = 'https://swapi.dev/api/' + endpoint + '/' + index;

    return new Promise((resolve, reject) => {
        https.get(star_wars_api_url, res => {
            let data = '';
            res.on('data', chunk => {
                data += chunk.toString();
            });
            res.on('error', reject)
            res.on('end', () => {
                    resolve(JSON.parse(data));
            });
        });
    });
}

// Returns all Star Wars people by name.
// Takes an optional query param "sortBy" that can be either 'name', 'height', or 'mass'.
// Defaults to sortBy name.
app.get('/people', async (req, res)=>{

    // optional param sortBy
    let sortBy = req.query.sortBy ? req.query.sortBy : 'name';
    if (!(['name', 'height', 'mass'].includes(sortBy))) {
        sortBy = 'name';
    }

    // store names
    const name_objects = [];

    // verified the star wars api indexing starts at 1
    let current_name_index = 1;

    // there are missing indices, giving some leeway to make sure we don't stop early
    let missed_indices = 0;
    const missed_max = 5;

    // run a loop, breaks when the api calls fail more than missed_max times
    while (missed_indices < missed_max) {
        try {

            // create list of request indices for concurrent requests
            let current_name_indices_list = [...Array(CONCURRENCY).keys()]
            current_name_indices_list = current_name_indices_list.map( name_index => name_index + current_name_index)

            // process some requests concurrently
            const people_promises = current_name_indices_list.map( name_index => {
                return get_star_wars_object('people', name_index)
            });
            const people_object_list = await Promise.all(people_promises)

            // process responses
            people_object_list.forEach( character_object => {

                // check for unknown responses
                if (!character_object.name) {
                    missed_indices++;
                    console.log('No response/object at index: ' + current_name_index);
                    console.log('Total Missed Indices: ' + missed_indices);
                } else {
                    // store the name in our list along with sortable data fields
                    console.log('Character found: ' + character_object.name);
                    name_objects.push({
                        'name': character_object.name ? character_object.name : null,
                        'height': character_object.height ? character_object.height : null,
                        'mass': character_object.mass ? character_object.mass : null,
                    });
                }
            })

            // retrieve the next records
            current_name_index = current_name_index  + CONCURRENCY;
        }
        catch (err) {
            console.log('error');
        }
    }
    console.log('Max misses reached, assuming content consumed.')

    // sort the list by the sortBy key
    name_objects.sort(function(a, b) {
        const value1 = a[sortBy];
        const value2 = b[sortBy]
        return (value1 < value2) ? -1 : (value1 > value2) ? 1 : 0
    });

    // after sorting, map back to just names
    const just_names = name_objects.map( x => x.name )

    res.status(200);
    res.send(JSON.stringify(just_names));
});

// Returns all Star Wars planets.
// Resolves the returned list of SWAPI links for residents to actual resident full names.
// Returns as-is, without sort.
app.get('/planets', async (req, res)=>{

    // store planets
    const planet_objects = [];

    // verified this indexing starts at 1
    let current_planet_index = 1;

    // there are missing indices, giving some leeway to make sure we don't stop early
    let missed_indices = 0;
    const missed_max = 3;

    // run a loop, breaks when the api calls fail more than missed_max times
    while (missed_indices < missed_max) {
        try {

            // create list of request indices for concurrent requests
            let current_planet_indices_list = [...Array(CONCURRENCY).keys()]
            current_planet_indices_list = current_planet_indices_list.map( planet_index => planet_index + current_planet_index)

            // process some requests concurrently
            const planet_promises = current_planet_indices_list.map( planet_index => {
                return get_star_wars_object('planets', planet_index)
            });
            const planet_object_list = await Promise.all(planet_promises)

            // process responses
            await Promise.all(planet_object_list.map( async planet_object => {

                // track missed indices and stop if we've missed too many
                if (!planet_object.name) {
                    missed_indices++;
                    console.log('No response/object at index: ' + current_planet_index)
                    console.log('Total Missed Indices: ' + missed_indices)
                }
                // resolve the residents to names and store the updated planet object
                else {
                    console.log('Processing residents for: ' + planet_object.name);

                    // process resident urls in parallel
                    const resident_promises = planet_object['residents'].map(url => {
                        const char_index = url.split('/').slice(-2, -1)[0]
                        return get_star_wars_object('people', char_index)
                    });
                    const residents_object_list = await Promise.all(resident_promises)

                    // update the planet object with the resolved values and store
                    planet_object['residents'] = residents_object_list.map(resident => resident.name)
                    planet_objects.push(planet_object);
                }
            }))

            // retrieve the next record
            current_planet_index = current_planet_index + CONCURRENCY
        }
        catch (err) {
            console.log('error');
        }
    }
    console.log('Max misses reached, assuming content consumed.')

    res.status(200);
    res.send(JSON.stringify(planet_objects));
});


app.listen(PORT, (error) =>{
    if(!error)
        console.log("Server is running and listening on port " + PORT)
    else
        console.log("Error", error);
});