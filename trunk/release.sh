#!/bin/bash

#
# Copyright (C) 2013 Doubango Telecom <http://www.doubango.org>
# License: GPLv3
# This file is part of Open Source click-to-call service <http://www.click2dial.org>
#

API_VERSION=1.0.1
API_FOLDER_NAME=release
API_FILE_NAME=c2c-api.js
API_FILE_PATH=$API_FOLDER_NAME/$API_FILE_NAME

# src dst
CompressFile()
{	
	echo Compressing ... $1 to $2
	if [ ${1: -3} == ".js" ]
	then
		# java -jar google-closure-compiler.jar --js $1 --js_output_file $2 --charset utf-8
		java -jar yuicompressor-2.4.7.jar $1 -o $2 --charset utf-8
	else
		java -jar yuicompressor-2.4.7.jar $1 -o $2 --charset utf-8
	fi
}

# src dst
AppendFile()
{
	echo Appending... $1 to $2
	cat $1 >> $2
}

#dst
AppendScripts()
{
	echo "c2c = { debug: false };" > $1
	echo "if(window.console.info)window.console.info('[C2C] API version = $API_VERSION');" >> $1
	
	AppendFile c2c-base64.js $1
    AppendFile c2c-md5.js $1
    AppendFile c2c-api.js $1
    
}

# src dst
DeployFile()
{
	if [ ${1: -3} == ".js" ] || [ ${1: -4} == ".css" ]
	then
		CompressFile $1 $2
	else
		echo copying to... $2
		cp -f $1 $2
	fi
}

# folder
DeployFolder()
{
	for src_file in $(find $1 -name '*.js' -o -name '*.htm' -o -name '*.html' -o -name '*.css' -o -name '*.wav' -o -name '*.png' -o -name '*.bmp' -o -name '*.jpg')
	do 
		name=`basename $src_file`
		src_dir=`dirname "$src_file"`
		base=${src_file%/*}
		
		dest_dir=$API_FOLDER_NAME/${src_dir: 0}
		dest_file=$dest_dir/$name
		mkdir -p $dest_dir
		
		DeployFile $src_file $dest_file
	done
}

# deploy assets
DeployFolder assets

# deploy images
DeployFolder images

# deploy sounds
DeployFolder sounds

# deploy html files
for file in account.htm admin.htm contact.htm doc.htm index.html ug.htm
do
	DeployFile $file $API_FOLDER_NAME/$file
done

# append JS scripts
AppendScripts $API_FILE_PATH.tmp.js
# compress JS scripts
CompressFile $API_FILE_PATH.tmp.js $API_FILE_PATH
rm -rf $API_FILE_PATH.tmp.js

# generate and deploy documentation
#./docgen.sh
#DeployFolder docgen


