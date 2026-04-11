3  c  <?php
$m = new mysqli('localhost', 'root', '', 'real_estate_db');
if ($m->connect_error) { die('Connection failed: ' . $m->connect_error); }
$r = $m->query("SHOW COLUMNS FROM properties LIKE 'interest_rate'");
if ($r->num_rows === 0) {
    $m->query('ALTER TABLE properties ADD COLUMN interest_rate DECIMAL(5,2) NOT NULL DEFAULT 6.50 AFTER longitude');
    echo "Column interest_rate added.\n";
} else {
    echo "Column interest_rate already exists.\n";
}
$m->close();
