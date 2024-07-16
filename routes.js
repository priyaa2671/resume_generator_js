const express = require('express');
const router = express.Router();
const axios = require('axios');
const mysql = require('mysql2');
const bcrypt = require('bcrypt');
const dbConfig = {
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
};

const connection = mysql.createConnection(dbConfig);

router.get('/', (req, res) => {
  res.render('index');
});

router.get('/login', (req, res) => {
  res.render('login');
});

router.get('/signup', (req, res) => {
  res.render('signup');
});

router.post('/signup', async (req, res) => {
  const { firstName, lastName, username, email, password, phone } = req.body;

  if (!email.endsWith('@eagles.oc.edu')) {
    return res.status(400).send('Please enter a valid OC email');
  }

  try {
    const hashedPassword = await bcrypt.hash(password, 10);
    const query = 'INSERT INTO users (firstName, lastName, username, email, hashed_password, phone) VALUES (?, ?, ?, ?, ?, ?)';
    const values = [firstName, lastName, username, email, hashedPassword, phone];

    connection.query(query, values, (error, results) => {
      if (error) {
        console.error('Error inserting user:', error);
        return res.status(500).send('Error inserting user');
      }
      res.redirect('/login');
    });
  } catch (error) {
    console.error('Error signing up:', error);
    res.status(500).send('Error signing up');
  }
});

router.post('/login', async (req, res) => {
    const { email, password } = req.body;
  
    const query = 'SELECT * FROM users WHERE email = ?';
    connection.query(query, [email], async (error, results) => {
      if (error) {
        console.error('Error querying the database:', error);
        return res.status(500).send('Error querying the database');
      }
  
      if (results.length === 0) {
        return res.status(401).send('Invalid email or password');
      }
  
      const user = results[0];
      const passwordMatch = await bcrypt.compare(password, user.hashed_password);
  
      if (!passwordMatch) {
        return res.status(401).send('Invalid email or password');
      }
  
      req.session.user = user; // Save the user information in the session
  
      // Insert login time into Sessions table
      const loginTime = new Date();
      const insertSessionQuery = 'INSERT INTO Sessions (user_id, email, login_time) VALUES (?, ?, ?)';
      connection.query(insertSessionQuery, [user.id, email, loginTime], (sessionError) => {
        if (sessionError) {
          console.error('Error inserting session:', sessionError);
          return res.status(500).send('Error inserting session');
        }
        res.redirect('/resume');
      });
    });
  });

  router.get('/logout', (req, res) => {
    if (req.session.user) {
      const user = req.session.user;
      const logoutTime = new Date();
      console.log(`Updating logout time for user: ${user.id}, email: ${user.email}, logoutTime: ${logoutTime}`);
  
      const updateLogoutQuery = 'UPDATE Sessions SET logout_time = ? WHERE user_id = ? AND email = ? AND logout_time IS NULL';
      connection.query(updateLogoutQuery, [logoutTime, user.id, user.email], (error, results) => {
        if (error) {
          console.error('Error updating session:', error);
          return res.status(500).send('Error updating session');
        }
        console.log('Logout time updated successfully');
  
        req.session.destroy((err) => {
          if (err) {
            return res.status(500).send('Failed to logout');
          }
          res.redirect('/');
        });
      });
    } else {
      res.redirect('/');
    }
  });
  

router.get('/resume', (req, res) => {
  if (!req.session.user) {
    return res.redirect('/login'); // Redirect to login if the user is not logged in
  }
  res.render('resume', { user: req.session.user });
});

// Add this code snippet where appropriate in the existing routes.js file

// Function to handle splitting skills and proficiency levels
// Function to handle splitting skills and proficiency levels
function parseSkills(skills) {
    return skills.split(',').map(skill => {
      const [skill_name, proficiency_level] = skill.split(':').map(s => s.trim());
      return { skill_name, proficiency_level };
    });
  }

  // Function to handle splitting certificates
function parseCertificates(certificateNames, issuingOrganizations, issueDates, expirationDates) {
    const certificates = [];
    for (let i = 0; i < certificateNames.length; i++) {
      certificates.push({
        certificate_name: certificateNames[i],
        issuing_organization: issuingOrganizations[i],
        issue_date: issueDates[i],
        expiration_date: expirationDates[i]
      });
    }
    return certificates;
}

// Modify the /generate_resume route
router.post('/generate_resume', async (req, res) => {
    const { degree, institution, startDate, endDate, company_name, role, experience_start_date, experience_end_date, description, skills, linkedUrl, jobDescription, certificate_name, issuing_organization, issue_date, expiration_date } = req.body;
    const { firstName, lastName, email, phone } = req.session.user;

    if (!firstName || !lastName || !email || !phone || !degree || !institution || !startDate || !endDate || !company_name || !role || !experience_start_date || !experience_end_date || !skills || !jobDescription) {
        return res.status(400).send('All fields are required');
    }

    const prompt = `Generate concise bullet points for the experience section based on experience at ${company_name} as a ${role} from ${experience_start_date} to ${experience_end_date}, a ${degree} from ${institution}, and skills in ${skills}. Ensure the points align with the following job description: ${jobDescription}.`;

    try {
        const response = await axios.post('https://api.openai.com/v1/chat/completions', {
            model: 'gpt-4',
            messages: [
                { role: 'system', content: 'You are a helpful assistant.' },
                { role: 'user', content: prompt }
            ]
        }, {
            headers: {
                'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
                'Content-Type': 'application/json'
            }
        });

        const experienceDescription = response.data.choices[0].message.content.trim();
        const experiencePoints = experienceDescription
            .split('\n')
            .map(point => point.trim().replace(/^- /, '').replace(/\.$/, '').trim() + '.')
            .filter(line => line.trim() !== '.');

        const user = req.session.user;

        const insertEducationQuery = 'INSERT INTO Education (user_id, degree, institution, start_date, end_date, email) VALUES (?, ?, ?, ?, ?, ?)';
        const educationValues = [user.id, degree, institution, startDate, endDate, email];
        connection.query(insertEducationQuery, educationValues, (error, results) => {
            if (error) {
                console.error('Error saving education:', error);
                return res.status(500).send('Error saving education');
            }

            const insertExperienceQuery = 'INSERT INTO Experience (user_id, company_name, role, start_date, end_date, description, email) VALUES (?, ?, ?, ?, ?, ?, ?)';
            const experienceValues = [user.id, company_name, role, experience_start_date, experience_end_date, experiencePoints.join(' '), email];
            connection.query(insertExperienceQuery, experienceValues, (error, results) => {
                if (error) {
                    console.error('Error saving experience:', error);
                    return res.status(500).send('Error saving experience');
                }

                const parsedSkills = parseSkills(skills);
                const insertSkillsQuery = 'INSERT INTO Skills (user_id, email, skill_name, proficiency_level) VALUES (?, ?, ?, ?)';
                parsedSkills.forEach(skill => {
                    const skillValues = [user.id, email, skill.skill_name, skill.proficiency_level];
                    connection.query(insertSkillsQuery, skillValues, (error, results) => {
                        if (error) {
                            console.error('Error saving skill:', error);
                            return res.status(500).send('Error saving skill');
                        }
                    });
                });

                const parsedCertificates = parseCertificates(certificate_name, issuing_organization, issue_date, expiration_date);
                const insertCertificatesQuery = 'INSERT INTO Certificates (user_id, certificate_name, issuing_organization, issue_date, expiration_date, email) VALUES (?, ?, ?, ?, ?, ?)';
                parsedCertificates.forEach(cert => {
                    const certificateValues = [user.id, cert.certificate_name, cert.issuing_organization, cert.issue_date, cert.expiration_date, email];
                    connection.query(insertCertificatesQuery, certificateValues, (error, results) => {
                        if (error) {
                            console.error('Error saving certificate:', error);
                            return res.status(500).send('Error saving certificate');
                        }
                    });
                });

                const insertResumeQuery = 'INSERT INTO resumes (user_id, firstName, lastName, email, phone, degree, institution, start_date, end_date, experience, skills, linkedUrl) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)';
                const resumeValues = [user.id, firstName, lastName, email, phone, degree, institution, startDate, endDate, experiencePoints.join(' '), skills, linkedUrl];
                connection.query(insertResumeQuery, resumeValues, (error, results) => {
                    if (error) {
                        console.error('Error saving resume:', error);
                        return res.status(500).send('Error saving resume');
                    }
                    res.render('generated_resume', {
                        firstName,
                        lastName,
                        email,
                        phone,
                        degree,
                        institution,
                        startDate,
                        endDate,
                        company_name,
                        role,
                        experience_start_date,
                        experience_end_date,
                        description: experiencePoints,
                        skills: parsedSkills,
                        linkedUrl,
                        certificates: parsedCertificates
                    });
                });
            });
        });
    } catch (error) {
        console.error('Error generating description:', error);
        res.status(500).send('Error generating description');
    }
});
