set -x
W=/www/wwwroot/doctieuthuyet.com; cd $W
sudo ls wp-content/mu-plugins wp-content/themes
T=/tmp/dttexp; sudo rm -rf $T; sudo mkdir -p $T
sudo tar --exclude='*.bak*' --exclude='._*' --exclude='.DS_Store' -czf $T/x.tgz wp-content/themes/tehi-theme wp-content/mu-plugins dtt-sw.js dtt-offline-sw-ext.js 2>&1 | tail -3
sudo cp $T/x.tgz $W/dtt-giaodien-1b8211a542c44a54.tgz; sudo chmod 644 $W/dtt-giaodien-1b8211a542c44a54.tgz; sudo ls -lh $W/dtt-giaodien-1b8211a542c44a54.tgz
sudo ls -lt /www/backup/ir/ 2>&1 | head
R=$(sudo ls -t /www/backup/ir/report4-*.txt 2>/dev/null | head -1); [ -n "$R" ] && sudo cp $R $W/dtt-ir-7fc8313a760a34b934d6.txt && sudo chmod 644 $W/dtt-ir-7fc8313a760a34b934d6.txt
sudo ls -la $W/wp-includes/certificates
