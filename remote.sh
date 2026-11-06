sudo bash <<'IN'
W=/www/wwwroot/doctieuthuyet.com; cd $W || exit 1
ls wp-content/mu-plugins wp-content/themes
T=/tmp/dttexp; rm -rf $T; mkdir -p $T
tar --exclude='*.bak*' --exclude='._*' --exclude='.DS_Store' --exclude='*.off' -czf $T/x.tgz wp-content/themes/tehi-theme wp-content/mu-plugins $(ls dtt-sw.js dtt-offline-sw-ext.js 2>/dev/null) ; echo tar=$?
cp $T/x.tgz dtt-giaodien-1b8211a542c44a54.tgz; chmod 644 dtt-giaodien-1b8211a542c44a54.tgz; ls -lh dtt-giaodien-1b8211a542c44a54.tgz
R=$(ls -t /www/backup/ir/report4-*.txt | head -1); cp $R dtt-ir-7fc8313a760a34b934d6.txt; chmod 644 dtt-ir-7fc8313a760a34b934d6.txt; ls -l dtt-ir-*.txt
getfacl -p . 2>/dev/null | head -12
IN
